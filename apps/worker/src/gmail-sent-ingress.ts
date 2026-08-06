import {
  MailroomError,
  sha256Hex,
  splitEmailAddress,
  verifyImportRequest,
} from '@mailroom/core'
import { ingestEmail } from './ingest.js'
import {
  completeIngressEvent,
  failIngressEvent,
  startIngressEvent,
} from './ingress-events.js'
import type { WaitUntilContext } from './types.js'

const SOURCE = 'gmail-sent'
const PROVIDER_ID = /^[a-z0-9_-]{1,256}$/i

function requiredHeader(
  request: Request,
  name: string,
  maxLength = 512,
): string {
  const value = request.headers.get(name)?.trim()
  if (!value || value.length > maxLength) {
    throw new MailroomError(
      'AUTH_REQUIRED',
      `The Gmail import is missing valid ${name} metadata.`,
    )
  }
  return value
}

function emailHeader(request: Request, name: string): string {
  const value = requiredHeader(request, name, 320).toLowerCase()
  if (!splitEmailAddress(value)) {
    throw new MailroomError(
      'INVALID_INPUT',
      `The Gmail import has an invalid ${name} address.`,
    )
  }
  return value
}

export async function authenticateGmailSentEmail(
  request: Request,
  env: Pick<Env, 'GMAIL_SYNC_SECRET' | 'MAX_EMAIL_BYTES'>,
): Promise<{
  account: string
  mailbox: string
  providerMessageId: string
  idempotencyKey: string
  body: ArrayBuffer
}> {
  if (!env.GMAIL_SYNC_SECRET) {
    throw new MailroomError(
      'FORBIDDEN',
      'Gmail Sent synchronization is not configured.',
    )
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('message/rfc822')) {
    throw new MailroomError(
      'INVALID_INPUT',
      'The Gmail import must contain a raw message/rfc822 email.',
    )
  }

  const limit = Number(env.MAX_EMAIL_BYTES)
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    throw new MailroomError('INVALID_INPUT', 'The Gmail email is too large.')
  }
  const body = await request.arrayBuffer()
  if (!body.byteLength || body.byteLength > limit) {
    throw new MailroomError(
      'INVALID_INPUT',
      'The Gmail email has an invalid size.',
    )
  }

  const account = emailHeader(request, 'x-mailroom-account')
  const mailbox = emailHeader(request, 'x-mailroom-mailbox')
  const providerMessageId = requiredHeader(
    request,
    'x-mailroom-provider-message-id',
    256,
  )
  if (!PROVIDER_ID.test(providerMessageId)) {
    throw new MailroomError(
      'INVALID_INPUT',
      'The Gmail provider message id is invalid.',
    )
  }

  const idempotencyKey = requiredHeader(
    request,
    'x-mailroom-idempotency-key',
    1_024,
  )
  const expectedIdempotencyKey = `${SOURCE}:${account}:${providerMessageId}`
  if (idempotencyKey !== expectedIdempotencyKey) {
    throw new MailroomError(
      'INVALID_INPUT',
      'The Gmail idempotency key does not match the message.',
    )
  }

  const signed = {
    timestamp: requiredHeader(request, 'x-mailroom-timestamp', 32),
    idempotencyKey,
    source: SOURCE,
    account,
    providerMessageId,
    mailbox,
    bodySha256: requiredHeader(
      request,
      'x-mailroom-body-sha256',
      64,
    ).toLowerCase(),
  }
  const actualHash = await sha256Hex(body)
  const signature = requiredHeader(request, 'x-mailroom-signature', 128)
  if (
    actualHash !== signed.bodySha256 ||
    !(await verifyImportRequest(env.GMAIL_SYNC_SECRET, signed, signature))
  ) {
    throw new MailroomError(
      'FORBIDDEN',
      'The Gmail import signature is invalid.',
    )
  }
  return {
    account,
    mailbox,
    providerMessageId,
    idempotencyKey,
    body,
  }
}

export async function receiveGmailSentEmail(
  request: Request,
  env: Env,
  executionCtx: WaitUntilContext,
): Promise<{ messageId: string; duplicate: boolean }> {
  const delivery = await authenticateGmailSentEmail(request, env)

  const event = await startIngressEvent(env.DB, {
    idempotencyKey: delivery.idempotencyKey,
    source: SOURCE,
    recipient: delivery.mailbox,
  })
  if (event.state === 'duplicate') {
    return { messageId: event.messageId, duplicate: true }
  }

  try {
    const result = await ingestEmail(env, executionCtx, {
      from: delivery.mailbox,
      to: delivery.mailbox,
      mailbox: delivery.mailbox,
      direction: 'outbound',
      rawBytes: delivery.body,
      rawSize: delivery.body.byteLength,
      headers: request.headers,
      source: SOURCE,
      providerMessageId: delivery.providerMessageId,
      expectedSender: delivery.mailbox,
    })
    await completeIngressEvent(
      env.DB,
      delivery.idempotencyKey,
      result.messageId,
    )
    return result
  } catch (error) {
    await failIngressEvent(env.DB, delivery.idempotencyKey, error)
    throw error
  }
}
