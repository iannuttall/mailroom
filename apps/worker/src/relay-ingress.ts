import { MailroomError, sha256Hex, verifyIngressRequest } from '@mailroom/core'
import { ingestEmail } from './ingest.js'
import {
  completeIngressEvent,
  failIngressEvent,
  startIngressEvent,
} from './ingress-events.js'
import type { WaitUntilContext } from './types.js'

function requiredHeader(request: Request, name: string): string {
  const value = request.headers.get(name)
  if (!value) {
    throw new MailroomError(
      'AUTH_REQUIRED',
      'The relay request is missing authentication metadata.',
    )
  }
  return value
}

export async function receiveRelayEmail(
  request: Request,
  env: Env,
  executionCtx: WaitUntilContext,
): Promise<{ messageId: string; duplicate: boolean }> {
  const limit = Number(env.MAX_EMAIL_BYTES)
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    throw new MailroomError('INVALID_INPUT', 'The relayed email is too large.')
  }
  const body = await request.arrayBuffer()
  if (!body.byteLength || body.byteLength > limit) {
    throw new MailroomError(
      'INVALID_INPUT',
      'The relayed email has an invalid size.',
    )
  }

  const from = requiredHeader(request, 'x-mailroom-from').toLowerCase()
  const to = requiredHeader(request, 'x-mailroom-to').toLowerCase()
  const idempotencyKey = requiredHeader(request, 'x-mailroom-idempotency-key')
  const signed = {
    timestamp: requiredHeader(request, 'x-mailroom-timestamp'),
    idempotencyKey,
    from,
    to,
    bodySha256: requiredHeader(request, 'x-mailroom-body-sha256'),
  }
  const actualHash = await sha256Hex(body)
  const signature = requiredHeader(request, 'x-mailroom-signature')
  if (
    actualHash !== signed.bodySha256 ||
    !(await verifyIngressRequest(env.INGRESS_SECRET, signed, signature))
  ) {
    throw new MailroomError('FORBIDDEN', 'The relay signature is invalid.')
  }

  const event = await startIngressEvent(env.DB, {
    idempotencyKey,
    source: 'relay',
    recipient: to,
  })
  if (event.state === 'duplicate') {
    return { messageId: event.messageId, duplicate: true }
  }

  try {
    const result = await ingestEmail(env, executionCtx, {
      from,
      to,
      mailbox: to,
      direction: 'inbound',
      rawBytes: body,
      rawSize: body.byteLength,
      headers: request.headers,
      source: 'relay',
    })
    await completeIngressEvent(env.DB, idempotencyKey, result.messageId)
    return result
  } catch (error) {
    await failIngressEvent(env.DB, idempotencyKey, error)
    throw error
  }
}
