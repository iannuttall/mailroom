import {
  type InboundArchiveJob,
  isInboundArchiveJob,
  PENDING_INBOUND_PREFIX,
} from './inbound-archive.js'
import { ingestEmail } from './ingest.js'
import type { WaitUntilContext } from './types.js'

export type InboundQueueMessage = {
  markerKey: string
}

const SWEEP_BATCH_SIZE = 100

function isQueueMessage(value: unknown): value is InboundQueueMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Partial<InboundQueueMessage>).markerKey === 'string'
  )
}

async function readJob(
  bucket: R2Bucket,
  markerKey: string,
): Promise<InboundArchiveJob | null> {
  const marker = await bucket.get(markerKey)
  if (!marker) return null
  const value: unknown = await marker.json()
  if (!isInboundArchiveJob(value)) {
    throw new Error(`Invalid inbound marker: ${markerKey}`)
  }
  return value
}

export async function processInboundMarker(
  env: Env,
  executionCtx: WaitUntilContext,
  markerKey: string,
): Promise<boolean> {
  const job = await readJob(env.RAW, markerKey)
  if (!job) return false

  const raw = await env.RAW.get(job.rawKey)
  if (!raw) throw new Error(`Archived email is missing: ${job.rawKey}`)

  await ingestEmail(env, executionCtx, {
    from: job.from,
    to: job.to,
    mailbox: job.mailbox,
    direction: 'inbound',
    raw: raw.body,
    rawSize: raw.size,
    headers: new Headers(job.headers),
    source: 'email-routing',
    providerMessageId: job.archiveId,
    archivedRawKey: job.rawKey,
  })
  await env.RAW.delete(markerKey)
  return true
}

export async function consumeInboundQueue(
  batch: MessageBatch<unknown>,
  env: Env,
  executionCtx: ExecutionContext,
): Promise<void> {
  await Promise.all(
    batch.messages.map(async (message) => {
      if (!isQueueMessage(message.body)) {
        console.error('mailroom_queue_message_invalid', {
          queueMessageId: message.id,
        })
        message.ack()
        return
      }

      try {
        await processInboundMarker(env, executionCtx, message.body.markerKey)
        message.ack()
      } catch (error) {
        console.error('mailroom_queue_processing_failed', {
          queueMessageId: message.id,
          markerKey: message.body.markerKey,
          attempt: message.attempts,
          error: error instanceof Error ? error.message : String(error),
        })
        message.retry({
          delaySeconds: Math.min(300, 15 * 2 ** message.attempts),
        })
      }
    }),
  )
}

export async function enqueueInboundMarker(
  env: Env,
  markerKey: string,
): Promise<boolean> {
  try {
    await env.INGEST_QUEUE.send({ markerKey })
    return true
  } catch (error) {
    console.error('mailroom_queue_enqueue_failed', {
      markerKey,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
  }
}

export async function sweepPendingInbound(env: Env): Promise<number> {
  const pending = await env.RAW.list({
    prefix: PENDING_INBOUND_PREFIX,
    limit: SWEEP_BATCH_SIZE,
  })
  if (!pending.objects.length) return 0

  await env.INGEST_QUEUE.sendBatch(
    pending.objects.map((object) => ({
      body: { markerKey: object.key },
    })),
  )
  console.log('mailroom_pending_sweep_enqueued', {
    count: pending.objects.length,
    truncated: pending.truncated,
  })
  return pending.objects.length
}
