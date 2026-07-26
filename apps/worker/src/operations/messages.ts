import { MailroomError } from '@mailroom/core'
import { cursorFor, cursorFrom, parseJson } from '../database.js'
import {
  inputBoolean,
  inputNumber,
  inputString,
  optionalString,
} from '../operation-input.js'
import { hybridSearch, indexMessage } from '../search.js'
import type { OperationContext } from '../types.js'

type Input = Record<string, unknown>
type Row = Record<string, unknown>

function summary(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    threadId: row.thread_id,
    inboxId: row.inbox_id,
    direction: row.direction,
    status: row.status,
    from: row.sender,
    to: parseJson(row.recipients, []),
    subject: row.subject,
    preview: row.preview,
    receivedAt: row.received_at,
    hasAttachments: Number(row.attachment_count) > 0,
    classification: row.classification,
  }
}

function body(row: Row, includeBody: boolean): Record<string, unknown> {
  return {
    ...summary(row),
    ...(includeBody
      ? {
          text: row.text_body,
          html: row.html_body,
        }
      : {}),
  }
}

export async function listMessages(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const limit = inputNumber(input, 'limit')
  const clauses: string[] = ['1 = 1']
  const values: unknown[] = []
  for (const [field, column] of [
    ['inboxId', 'inbox_id'],
    ['threadId', 'thread_id'],
    ['status', 'status'],
    ['direction', 'direction'],
    ['sender', 'sender'],
  ] as const) {
    const value = optionalString(input, field)
    if (value) {
      clauses.push(`${column} = ?`)
      values.push(value)
    }
  }
  const since = optionalString(input, 'since')
  if (since) {
    clauses.push('received_at >= ?')
    values.push(since)
  }
  const before = optionalString(input, 'before')
  if (before) {
    clauses.push('received_at < ?')
    values.push(before)
  }
  const cursor = cursorFrom(input.cursor)
  if (cursor) {
    clauses.push('(received_at < ? OR (received_at = ? AND id < ?))')
    values.push(cursor.at, cursor.at, cursor.id)
  }
  const result = await context.env.DB.prepare(
    `SELECT * FROM messages WHERE ${clauses.join(' AND ')}
    ORDER BY received_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, limit + 1)
    .all<Row>()
  const rows = result.results.slice(0, limit)
  return {
    items: rows.map(summary),
    nextCursor:
      result.results.length > limit
        ? cursorFor({
            at: String(rows.at(-1)?.received_at),
            id: String(rows.at(-1)?.id),
          })
        : null,
  }
}

export async function getMessage(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const row = await context.env.DB.prepare(
    'SELECT * FROM messages WHERE id = ?',
  )
    .bind(id)
    .first<Row>()
  if (!row) throw new MailroomError('NOT_FOUND', `Message ${id} was not found.`)

  const includeHeaders = inputBoolean(input, 'includeHeaders')
  const includeAttachments = inputBoolean(input, 'includeAttachments')
  let attachments: Row[] = []
  if (includeAttachments) {
    const result = await context.env.DB.prepare(
      `SELECT id, filename, content_type, content_id, disposition, size_bytes
      FROM attachments WHERE message_id = ? ORDER BY created_at, id`,
    )
      .bind(id)
      .all<Row>()
    attachments = result.results
  }
  return {
    ...body(row, inputBoolean(input, 'includeBody')),
    cc: parseJson(row.cc, []),
    inReplyTo: row.in_reply_to,
    references: parseJson(row.message_references, []),
    ...(includeHeaders ? { headers: parseJson(row.headers, {}) } : {}),
    ...(includeAttachments
      ? {
          attachments: attachments.map((attachment) => ({
            id: attachment.id,
            filename: attachment.filename,
            contentType: attachment.content_type,
            contentId: attachment.content_id,
            disposition: attachment.disposition,
            sizeBytes: attachment.size_bytes,
          })),
        }
      : {}),
  }
}

export async function getThread(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const threadId = inputString(input, 'threadId')
  const limit = inputNumber(input, 'limit')
  const result = await context.env.DB.prepare(
    `SELECT * FROM messages WHERE thread_id = ?
    ORDER BY received_at DESC, id DESC LIMIT ?`,
  )
    .bind(threadId, limit)
    .all<Row>()
  if (!result.results.length) {
    throw new MailroomError('NOT_FOUND', `Thread ${threadId} was not found.`)
  }
  return {
    threadId,
    messages: result.results
      .reverse()
      .map((row) => body(row, inputBoolean(input, 'includeBodies'))),
  }
}

function ftsQuery(query: string): string | null {
  const terms = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) ?? []
  return terms.length
    ? terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' AND ')
    : null
}

async function fallbackSearch(
  context: OperationContext,
  input: Input,
): Promise<unknown[]> {
  const query = ftsQuery(inputString(input, 'query'))
  if (!query) return []
  const clauses = ['message_fts MATCH ?']
  const values: unknown[] = [query]
  const inboxId = optionalString(input, 'inboxId')
  if (inboxId) {
    clauses.push('m.inbox_id = ?')
    values.push(inboxId)
  }
  const direction = optionalString(input, 'direction')
  if (direction) {
    clauses.push('m.direction = ?')
    values.push(direction)
  }
  const status = optionalString(input, 'status')
  if (status) {
    clauses.push('m.status = ?')
    values.push(status)
  }
  const classification = optionalString(input, 'classification')
  if (classification) {
    clauses.push('m.classification = ?')
    values.push(classification)
  }
  const result = await context.env.DB.prepare(
    `SELECT m.id, m.thread_id, m.subject, m.sender, m.preview, m.received_at,
      bm25(message_fts) AS rank,
      snippet(message_fts, 4, '', '', ' … ', 24) AS snippet
    FROM message_fts
    JOIN messages m ON m.id = message_fts.message_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY rank LIMIT ?`,
  )
    .bind(...values, inputNumber(input, 'limit'))
    .all<Row>()
  return result.results.map((row) => ({
    messageId: row.id,
    threadId: row.thread_id,
    subject: row.subject,
    from: row.sender,
    receivedAt: row.received_at,
    snippet: row.snippet || row.preview,
    source: 'fts',
  }))
}

export async function searchMessages(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  try {
    const results = await hybridSearch(context.env, {
      query: inputString(input, 'query'),
      inboxId: optionalString(input, 'inboxId'),
      direction: optionalString(input, 'direction'),
      status: optionalString(input, 'status'),
      classification: optionalString(input, 'classification'),
      limit: inputNumber(input, 'limit'),
    })
    if (results.length) return { items: results, source: 'ai-search' }
  } catch (error) {
    console.warn('mailroom_ai_search_fallback', {
      requestId: context.requestId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  return { items: await fallbackSearch(context, input), source: 'fts' }
}

export async function updateMessage(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const status = inputString(input, 'status')
  const result = await context.env.DB.prepare(
    'UPDATE messages SET status = ? WHERE id = ?',
  )
    .bind(status, id)
    .run()
  if (!result.meta.changes) {
    throw new MailroomError('NOT_FOUND', `Message ${id} was not found.`)
  }
  const row = await context.env.DB.prepare(
    `SELECT m.*, i.local_part, d.domain
    FROM messages m
    JOIN inboxes i ON i.id = m.inbox_id
    JOIN domains d ON d.id = i.domain_id
    WHERE m.id = ?`,
  )
    .bind(id)
    .first<Row>()
  if (row) {
    context.executionCtx.waitUntil(
      indexMessage(context.env, {
        id: String(row.id),
        threadId: String(row.thread_id),
        inboxId: String(row.inbox_id),
        mailbox: `${row.local_part}@${row.domain}`,
        direction: row.direction as 'inbound' | 'outbound',
        from: String(row.sender),
        to: parseJson<string[]>(row.recipients, []),
        cc: parseJson<string[]>(row.cc, []),
        subject: String(row.subject),
        text: String(row.text_body ?? ''),
        receivedAt: String(row.received_at),
        status: String(row.status),
        classification: row.classification ? String(row.classification) : null,
      }),
    )
  }
  return summary(row ?? {})
}
