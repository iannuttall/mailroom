import { MailroomError } from '@mailroom/core'

export function nowIso(): string {
  return new Date().toISOString()
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

export function asBoolean(value: unknown): boolean {
  return value === 1 || value === true
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function requireResult<T>(value: T | null, message: string): T {
  if (!value) throw new MailroomError('NOT_FOUND', message)
  return value
}

export function markPriorInboundMessagesRead(
  db: D1Database,
  threadId: string,
  outboundReceivedAt: string,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE messages SET status = 'read'
      WHERE thread_id = ? AND direction = 'inbound' AND status = 'unread'
        AND received_at <= ?`,
    )
    .bind(threadId, outboundReceivedAt)
}

export function cursorFrom(value: unknown): { at: string; id: string } | null {
  if (typeof value !== 'string') return null
  try {
    const decoded = atob(value)
    const parsed = JSON.parse(decoded) as { at?: unknown; id?: unknown }
    if (typeof parsed.at === 'string' && typeof parsed.id === 'string') {
      return { at: parsed.at, id: parsed.id }
    }
  } catch {
    throw new MailroomError('INVALID_INPUT', 'The cursor is invalid.')
  }
  throw new MailroomError('INVALID_INPUT', 'The cursor is invalid.')
}

export function cursorFor(
  row: { at: string; id: string } | undefined,
): string | null {
  return row ? btoa(JSON.stringify(row)) : null
}

export async function batchOrThrow(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result[]> {
  if (statements.length === 0) return []
  const results = await db.batch(statements)
  const failed = results.find((result) => !result.success)
  if (failed) {
    throw new MailroomError(
      'INTERNAL_ERROR',
      failed.error ?? 'The database operation failed.',
    )
  }
  return results
}
