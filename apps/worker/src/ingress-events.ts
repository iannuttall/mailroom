import { MailroomError } from '@mailroom/core'
import { newId, nowIso } from './database.js'

type StartIngressEvent = {
  idempotencyKey: string
  source: string
  recipient: string
}

export type IngressEventStart =
  | { state: 'duplicate'; messageId: string }
  | { state: 'started' }

export async function startIngressEvent(
  db: D1Database,
  input: StartIngressEvent,
): Promise<IngressEventStart> {
  const existing = await db
    .prepare(
      `SELECT message_id, state FROM ingress_events
      WHERE idempotency_key = ?`,
    )
    .bind(input.idempotencyKey)
    .first<{ message_id: string | null; state: string }>()

  if (existing?.message_id) {
    return { state: 'duplicate', messageId: existing.message_id }
  }
  if (existing?.state === 'processing') {
    throw new MailroomError(
      'CONFLICT',
      'This delivery is already being processed.',
    )
  }

  const now = nowIso()
  if (existing) {
    await db
      .prepare(
        `UPDATE ingress_events
        SET source = ?, recipient = ?, state = 'processing', error = NULL,
          updated_at = ?
        WHERE idempotency_key = ?`,
      )
      .bind(input.source, input.recipient, now, input.idempotencyKey)
      .run()
    return { state: 'started' }
  }

  try {
    await db
      .prepare(
        `INSERT INTO ingress_events
          (id, idempotency_key, source, recipient, state, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'processing', ?, ?)`,
      )
      .bind(
        newId('ing'),
        input.idempotencyKey,
        input.source,
        input.recipient,
        now,
        now,
      )
      .run()
  } catch {
    throw new MailroomError(
      'CONFLICT',
      'This delivery is already being processed.',
    )
  }
  return { state: 'started' }
}

export async function completeIngressEvent(
  db: D1Database,
  idempotencyKey: string,
  messageId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE ingress_events SET state = 'complete', message_id = ?,
        updated_at = ? WHERE idempotency_key = ?`,
    )
    .bind(messageId, nowIso(), idempotencyKey)
    .run()
}

export async function failIngressEvent(
  db: D1Database,
  idempotencyKey: string,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  await db
    .prepare(
      `UPDATE ingress_events SET state = 'failed', error = ?,
        updated_at = ? WHERE idempotency_key = ?`,
    )
    .bind(message.slice(0, 2_000), nowIso(), idempotencyKey)
    .run()
}
