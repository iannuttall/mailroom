import {
  MailroomError,
  normalizeMessageId,
  normalizeSubject,
} from '@mailroom/core'
import { addressParser } from 'postal-mime'
import {
  batchOrThrow,
  cursorFor,
  cursorFrom,
  markPriorInboundMessagesRead,
  newId,
  nowIso,
  parseJson,
} from '../database.js'
import { emailAddresses } from '../email-addresses.js'
import { inputNumber, inputString, optionalString } from '../operation-input.js'
import { sendOutbound } from '../outbound.js'
import { indexMessage } from '../search.js'
import type { OperationContext } from '../types.js'

type Input = Record<string, unknown>
type Row = Record<string, unknown>

export function draftRecipient(message: Row): string {
  if (typeof message.message_reply_to === 'string') {
    const address = emailAddresses(addressParser(message.message_reply_to))[0]
    if (address) return address
  }
  return String(message.sender)
}

function draftSummary(row: Row): Record<string, unknown> {
  return {
    id: row.id,
    messageId: row.message_id,
    threadId: row.thread_id,
    status: row.status,
    recipient: row.recipient,
    subject: row.subject,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sentAt: row.sent_at,
  }
}

export async function listDrafts(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const clauses = ['1 = 1']
  const values: unknown[] = []
  const status = optionalString(input, 'status')
  if (status) {
    clauses.push('status = ?')
    values.push(status)
  }
  const threadId = optionalString(input, 'threadId')
  if (threadId) {
    clauses.push('thread_id = ?')
    values.push(threadId)
  }
  const cursor = cursorFrom(input.cursor)
  if (cursor) {
    clauses.push('(created_at < ? OR (created_at = ? AND id < ?))')
    values.push(cursor.at, cursor.at, cursor.id)
  }
  const limit = inputNumber(input, 'limit')
  const result = await context.env.DB.prepare(
    `SELECT * FROM drafts WHERE ${clauses.join(' AND ')}
    ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, limit + 1)
    .all<Row>()
  const rows = result.results.slice(0, limit)
  return {
    items: rows.map(draftSummary),
    nextCursor:
      result.results.length > limit
        ? cursorFor({
            at: String(rows.at(-1)?.created_at),
            id: String(rows.at(-1)?.id),
          })
        : null,
  }
}

export async function getDraft(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const draft = await context.env.DB.prepare(
    'SELECT * FROM drafts WHERE id = ?',
  )
    .bind(id)
    .first<Row>()
  if (!draft) throw new MailroomError('NOT_FOUND', `Draft ${id} was not found.`)
  const events = await context.env.DB.prepare(
    `SELECT action, actor, note, created_at
    FROM draft_events WHERE draft_id = ? ORDER BY created_at, id`,
  )
    .bind(id)
    .all<Row>()
  return {
    ...draftSummary(draft),
    sender: draft.sender,
    replyTo: draft.reply_to,
    text: draft.text_body,
    html: draft.html_body,
    prompt: draft.prompt_id
      ? { id: draft.prompt_id, hash: draft.prompt_hash }
      : null,
    model: draft.model,
    providerMessageId: draft.provider_message_id,
    lastError: draft.last_error,
    events: events.results.map((event) => ({
      action: event.action,
      actor: event.actor,
      note: event.note,
      createdAt: event.created_at,
    })),
  }
}

export async function createDraft(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const sourceMessageId = inputString(input, 'messageId')
  const sourceMessage = await context.env.DB.prepare(
    `SELECT m.*, i.local_part, d.domain, d.from_address, d.reply_to,
      json_extract(m.headers, '$."reply-to"[0]') AS message_reply_to
    FROM messages m
    JOIN inboxes i ON i.id = m.inbox_id
    JOIN domains d ON d.id = i.domain_id
    WHERE m.id = ?`,
  )
    .bind(sourceMessageId)
    .first<Row>()
  if (!sourceMessage) {
    throw new MailroomError(
      'NOT_FOUND',
      `Message ${sourceMessageId} was not found.`,
    )
  }
  const text = inputString(input, 'text')
  const sender =
    (sourceMessage.from_address as string | null) ??
    `${sourceMessage.local_part}@${sourceMessage.domain}`
  const recipient = draftRecipient(sourceMessage)
  const originalSubject = String(sourceMessage.subject ?? '')
  const subject =
    optionalString(input, 'subject') ??
    (originalSubject.toLowerCase().startsWith('re:')
      ? originalSubject
      : `Re: ${originalSubject || '(no subject)'}`)
  const id = newId('drf')
  const now = nowIso()
  await batchOrThrow(context.env.DB, [
    context.env.DB.prepare(
      `INSERT INTO drafts (
        id, message_id, thread_id, status, recipient, sender, reply_to,
        subject, text_body, html_body, validation, source,
        prompt_id, prompt_hash, model, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      sourceMessageId,
      sourceMessage.thread_id,
      recipient,
      sender,
      sourceMessage.reply_to,
      subject,
      text,
      optionalString(input, 'html') ?? null,
      '{}',
      inputString(input, 'source'),
      optionalString(input, 'promptId') ?? null,
      optionalString(input, 'promptHash') ?? null,
      optionalString(input, 'model') ?? null,
      now,
      now,
    ),
    context.env.DB.prepare(
      `INSERT INTO draft_events
        (id, draft_id, action, actor, note, created_at)
      VALUES (?, ?, 'created', ?, ?, ?)`,
    ).bind(newId('evt'), id, inputString(input, 'source'), null, now),
  ])
  return {
    id,
    status: 'pending',
    recipient,
    sender,
    subject,
  }
}

export async function approveDraft(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const current = await context.env.DB.prepare(
    'SELECT status FROM drafts WHERE id = ?',
  )
    .bind(id)
    .first<Row>()
  if (!current)
    throw new MailroomError('NOT_FOUND', `Draft ${id} was not found.`)
  if (current.status === 'approved') return { id, status: 'approved' }
  if (current.status !== 'pending') {
    throw new MailroomError(
      'CONFLICT',
      `Only a pending draft can be approved; this draft is ${current.status}.`,
    )
  }
  const now = nowIso()
  const actor = inputString(input, 'approvedBy')
  await batchOrThrow(context.env.DB, [
    context.env.DB.prepare(
      "UPDATE drafts SET status = 'approved', updated_at = ? WHERE id = ?",
    ).bind(now, id),
    context.env.DB.prepare(
      `INSERT INTO draft_events
        (id, draft_id, action, actor, note, created_at)
      VALUES (?, ?, 'approved', ?, ?, ?)`,
    ).bind(newId('evt'), id, actor, optionalString(input, 'note') ?? null, now),
  ])
  return { id, status: 'approved', approvedBy: actor, approvedAt: now }
}

export async function rejectDraft(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const current = await context.env.DB.prepare(
    'SELECT status FROM drafts WHERE id = ?',
  )
    .bind(id)
    .first<{ status: string }>()
  if (!current)
    throw new MailroomError('NOT_FOUND', `Draft ${id} was not found.`)
  if (current.status === 'rejected') return { id, status: 'rejected' }
  if (!['pending', 'approved'].includes(current.status)) {
    throw new MailroomError(
      'CONFLICT',
      `A ${current.status} draft cannot be rejected.`,
    )
  }
  const now = nowIso()
  const actor = inputString(input, 'rejectedBy')
  const reason = inputString(input, 'reason')
  await batchOrThrow(context.env.DB, [
    context.env.DB.prepare(
      "UPDATE drafts SET status = 'rejected', updated_at = ? WHERE id = ?",
    ).bind(now, id),
    context.env.DB.prepare(
      `INSERT INTO draft_events
        (id, draft_id, action, actor, note, created_at)
      VALUES (?, ?, 'rejected', ?, ?, ?)`,
    ).bind(newId('evt'), id, actor, reason, now),
  ])
  return { id, status: 'rejected', rejectedBy: actor, rejectedAt: now }
}

export async function sendDraft(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const idempotencyKey = inputString(input, 'idempotencyKey')
  const previous = await context.env.DB.prepare(
    `SELECT state, provider_message_id, error FROM outbound_attempts
    WHERE idempotency_key = ?`,
  )
    .bind(idempotencyKey)
    .first<Row>()
  if (previous) {
    return {
      id,
      idempotentReplay: true,
      state: previous.state,
      providerMessageId: previous.provider_message_id,
      error: previous.error,
    }
  }
  const draft = await context.env.DB.prepare(
    `SELECT d.*, m.rfc_message_id, m.message_references,
      m.inbox_id, dom.relay_url
    FROM drafts d
    JOIN messages m ON m.id = d.message_id
    JOIN inboxes i ON i.id = m.inbox_id
    JOIN domains dom ON dom.id = i.domain_id
    WHERE d.id = ?`,
  )
    .bind(id)
    .first<Row>()
  if (!draft) throw new MailroomError('NOT_FOUND', `Draft ${id} was not found.`)
  if (draft.status !== 'approved') {
    throw new MailroomError(
      'CONFLICT',
      `Only an approved draft can be sent; this draft is ${draft.status}.`,
    )
  }
  const attemptId = newId('out')
  const startedAt = nowIso()
  await batchOrThrow(context.env.DB, [
    context.env.DB.prepare(
      `INSERT INTO outbound_attempts
        (id, draft_id, idempotency_key, transport, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'sending', ?, ?)`,
    ).bind(
      attemptId,
      id,
      idempotencyKey,
      draft.relay_url ? 'relay' : 'email-service',
      startedAt,
      startedAt,
    ),
    context.env.DB.prepare(
      "UPDATE drafts SET status = 'sending', updated_at = ? WHERE id = ?",
    ).bind(startedAt, id),
  ])

  try {
    const references = parseJson<string[]>(draft.message_references, [])
    if (draft.rfc_message_id) references.push(String(draft.rfc_message_id))
    const sent = await sendOutbound(
      context.env,
      {
        from: String(draft.sender),
        to: String(draft.recipient),
        replyTo: draft.reply_to ? String(draft.reply_to) : null,
        subject: String(draft.subject),
        text: String(draft.text_body),
        html: draft.html_body ? String(draft.html_body) : null,
        inReplyTo: draft.rfc_message_id ? String(draft.rfc_message_id) : null,
        references,
      },
      draft.relay_url ? String(draft.relay_url) : null,
      idempotencyKey,
    )
    const sentAt = nowIso()
    const messageId = newId('msg')
    const rfcMessageId = normalizeMessageId(sent.messageId)
    await batchOrThrow(context.env.DB, [
      markPriorInboundMessagesRead(
        context.env.DB,
        String(draft.thread_id),
        sentAt,
      ),
      context.env.DB.prepare(
        `INSERT INTO messages (
          id, thread_id, inbox_id, direction, status, rfc_message_id,
          in_reply_to, message_references, sender, recipients, cc, subject,
          normalized_subject, preview, text_body, html_body, headers, raw_key,
          size_bytes, attachment_count, search_status, provider_message_id,
          received_at, created_at
        ) VALUES (
          ?, ?, ?, 'outbound', 'read', ?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?,
          NULL, NULL, ?, 0, 'pending', ?, ?, ?
        )`,
      ).bind(
        messageId,
        draft.thread_id,
        draft.inbox_id,
        rfcMessageId,
        draft.rfc_message_id,
        JSON.stringify(references),
        draft.sender,
        JSON.stringify([draft.recipient]),
        draft.subject,
        normalizeSubject(String(draft.subject)),
        String(draft.text_body).slice(0, 240),
        draft.text_body,
        draft.html_body,
        new TextEncoder().encode(String(draft.text_body)).byteLength,
        sent.messageId,
        sentAt,
        sentAt,
      ),
      context.env.DB.prepare(
        `INSERT INTO message_fts
          (message_id, inbox_id, subject, sender, body, classification)
        VALUES (?, ?, ?, ?, ?, '')`,
      ).bind(
        messageId,
        draft.inbox_id,
        draft.subject,
        draft.sender,
        draft.text_body,
      ),
      context.env.DB.prepare(
        `UPDATE threads SET latest_at = ?, message_count = message_count + 1,
          updated_at = ? WHERE id = ?`,
      ).bind(sentAt, sentAt, draft.thread_id),
      context.env.DB.prepare(
        `UPDATE drafts SET status = 'sent', provider_message_id = ?,
          sent_at = ?, updated_at = ?, last_error = NULL WHERE id = ?`,
      ).bind(sent.messageId, sentAt, sentAt, id),
      context.env.DB.prepare(
        `UPDATE outbound_attempts SET state = 'sent', provider_message_id = ?,
          updated_at = ? WHERE id = ?`,
      ).bind(sent.messageId, sentAt, attemptId),
      context.env.DB.prepare(
        `INSERT INTO draft_events
          (id, draft_id, action, actor, note, created_at)
        VALUES (?, ?, 'sent', 'mailroom', ?, ?)`,
      ).bind(newId('evt'), id, sent.messageId, sentAt),
    ])
    context.executionCtx.waitUntil(
      indexMessage(context.env, {
        id: messageId,
        threadId: String(draft.thread_id),
        inboxId: String(draft.inbox_id),
        mailbox: String(draft.sender),
        direction: 'outbound',
        from: String(draft.sender),
        to: [String(draft.recipient)],
        cc: [],
        subject: String(draft.subject),
        text: String(draft.text_body),
        receivedAt: sentAt,
        status: 'read',
      }),
    )
    return {
      id,
      status: 'sent',
      providerMessageId: sent.messageId,
      sentAt,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failedAt = nowIso()
    await batchOrThrow(context.env.DB, [
      context.env.DB.prepare(
        `UPDATE drafts SET status = 'failed', last_error = ?,
          updated_at = ? WHERE id = ?`,
      ).bind(message.slice(0, 2_000), failedAt, id),
      context.env.DB.prepare(
        `UPDATE outbound_attempts SET state = 'failed', error = ?,
          updated_at = ? WHERE id = ?`,
      ).bind(message.slice(0, 2_000), failedAt, attemptId),
    ])
    throw new MailroomError('REMOTE_ERROR', 'The email could not be sent.', {
      draftId: id,
      attemptId,
    })
  }
}
