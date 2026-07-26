import { MailroomError, sha256Hex, verifyIngressRequest } from '@mailroom/core'
import { newId, nowIso } from './database.js'
import { ingestEmail } from './ingest.js'
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

  const existing = await env.DB.prepare(
    'SELECT message_id, state FROM ingress_events WHERE idempotency_key = ?',
  )
    .bind(idempotencyKey)
    .first<{ message_id: string | null; state: string }>()
  if (existing?.message_id) {
    return { messageId: existing.message_id, duplicate: true }
  }
  if (existing?.state === 'processing') {
    throw new MailroomError(
      'CONFLICT',
      'This relay delivery is already being processed.',
    )
  }

  const eventId = existing ? undefined : newId('ing')
  const now = nowIso()
  if (eventId) {
    try {
      await env.DB.prepare(
        `INSERT INTO ingress_events
          (id, idempotency_key, source, recipient, state, created_at, updated_at)
        VALUES (?, ?, 'relay', ?, 'processing', ?, ?)`,
      )
        .bind(eventId, idempotencyKey, to, now, now)
        .run()
    } catch {
      throw new MailroomError(
        'CONFLICT',
        'This relay delivery is already being processed.',
      )
    }
  } else {
    await env.DB.prepare(
      `UPDATE ingress_events SET state = 'processing', error = NULL,
        updated_at = ? WHERE idempotency_key = ?`,
    )
      .bind(now, idempotencyKey)
      .run()
  }

  try {
    const result = await ingestEmail(env, executionCtx, {
      from,
      to,
      raw: new Blob([body]).stream(),
      rawSize: body.byteLength,
      headers: request.headers,
      source: 'relay',
    })
    await env.DB.prepare(
      `UPDATE ingress_events SET state = 'complete', message_id = ?,
        updated_at = ? WHERE idempotency_key = ?`,
    )
      .bind(result.messageId, nowIso(), idempotencyKey)
      .run()
    return result
  } catch (error) {
    await env.DB.prepare(
      `UPDATE ingress_events SET state = 'failed', error = ?,
        updated_at = ? WHERE idempotency_key = ?`,
    )
      .bind(
        error instanceof Error ? error.message.slice(0, 2_000) : String(error),
        nowIso(),
        idempotencyKey,
      )
      .run()
    throw error
  }
}
