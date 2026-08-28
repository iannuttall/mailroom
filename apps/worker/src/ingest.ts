import {
  headersToRecord,
  MailroomError,
  messageIdReferences,
  normalizeMessageId,
  normalizeSubject,
  plainTextPreview,
} from '@mailroom/core'
import PostalMime, {
  type Attachment,
  type Email as ParsedEmail,
} from 'postal-mime'
import {
  batchOrThrow,
  markPriorInboundMessagesRead,
  newId,
  nowIso,
} from './database.js'
import { emailAddresses, firstEmailAddress } from './email-addresses.js'
import { requireInboundRoute } from './route-store.js'
import { indexMessage } from './search.js'
import { notifyTelegram } from './telegram.js'
import type { WaitUntilContext } from './types.js'

const MAX_TEXT_BODY = 750_000
const MAX_HTML_BODY = 1_500_000

export type StoredEmailEnvelope = {
  from: string
  to: string
  mailbox: string
  direction: 'inbound' | 'outbound'
  raw?: ReadableStream<Uint8Array>
  rawBytes?: ArrayBuffer
  rawSize: number
  headers: Headers
  source: 'email-routing' | 'relay' | 'gmail-sent'
  providerMessageId?: string
  expectedSender?: string
  archivedRawKey?: string
}

type StoredAttachment = {
  id: string
  filename: string | null
  contentType: string
  contentId: string | null
  disposition: string | null
  sizeBytes: number
  key: string
}

function attachmentBytes(attachment: Attachment): Uint8Array {
  if (typeof attachment.content === 'string') {
    return new TextEncoder().encode(attachment.content)
  }
  if (attachment.content instanceof ArrayBuffer) {
    return new Uint8Array(attachment.content)
  }
  return attachment.content
}

function receivedAt(parsed: ParsedEmail): string {
  const candidate = parsed.date ? new Date(parsed.date) : new Date()
  return Number.isNaN(candidate.valueOf())
    ? new Date().toISOString()
    : candidate.toISOString()
}

function parsedHeaders(parsed: ParsedEmail): Record<string, string[]> {
  const headers = new Headers()
  for (const header of parsed.headers) headers.append(header.key, header.value)
  return headersToRecord(headers)
}

export async function parseAndArchiveRawBytes(
  bucket: R2Bucket,
  key: string,
  raw: ArrayBuffer,
  metadata: Record<string, string>,
): Promise<ParsedEmail> {
  const [parsed] = await Promise.all([
    PostalMime.parse(raw, {
      attachmentEncoding: 'arraybuffer',
      maxNestingDepth: 20,
      maxHeadersSize: 512 * 1024,
    }),
    bucket.put(key, raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: metadata,
    }),
  ])
  return parsed
}

async function findThreadId(
  db: D1Database,
  inboxId: string,
  parsed: ParsedEmail,
): Promise<string | null> {
  const references = messageIdReferences(parsed.inReplyTo, parsed.references)
  if (references.length) {
    const placeholders = references.map(() => '?').join(', ')
    const matched = await db
      .prepare(
        `SELECT thread_id FROM messages
        WHERE inbox_id = ? AND rfc_message_id IN (${placeholders})
        ORDER BY received_at DESC LIMIT 1`,
      )
      .bind(inboxId, ...references)
      .first<{ thread_id: string }>()
    if (matched) return matched.thread_id
  }

  const normalized = normalizeSubject(parsed.subject)
  if (!normalized) return null
  const fallback = await db
    .prepare(
      `SELECT id FROM threads
      WHERE inbox_id = ? AND normalized_subject = ?
        AND datetime(latest_at) >= datetime('now', '-90 days')
      ORDER BY latest_at DESC LIMIT 1`,
    )
    .bind(inboxId, normalized)
    .first<{ id: string }>()
  return fallback?.id ?? null
}

async function storeAttachments(
  env: Env,
  messageId: string,
  attachments: Attachment[],
): Promise<StoredAttachment[]> {
  return Promise.all(
    attachments.map(async (attachment, index) => {
      const id = newId('att')
      const bytes = attachmentBytes(attachment)
      const key = `attachments/${messageId}/${String(index + 1).padStart(3, '0')}-${id}`
      await env.RAW.put(key, bytes, {
        httpMetadata: { contentType: attachment.mimeType },
        customMetadata: {
          messageId,
          filename: attachment.filename ?? '',
        },
      })
      return {
        id,
        filename: attachment.filename,
        contentType: attachment.mimeType,
        contentId: attachment.contentId ?? null,
        disposition: attachment.disposition,
        sizeBytes: bytes.byteLength,
        key,
      }
    }),
  )
}

export async function ingestEmail(
  env: Env,
  executionCtx: WaitUntilContext,
  envelope: StoredEmailEnvelope,
): Promise<{ messageId: string; duplicate: boolean }> {
  const maxBytes = Number(env.MAX_EMAIL_BYTES)
  if (
    !Number.isFinite(envelope.rawSize) ||
    envelope.rawSize <= 0 ||
    envelope.rawSize > maxBytes
  ) {
    throw new Error(
      `Email size ${envelope.rawSize} is outside the allowed range.`,
    )
  }

  const route = await requireInboundRoute(env.DB, envelope.mailbox)
  const messageId = newId('msg')
  const rawKey =
    envelope.archivedRawKey ?? `raw/${route.domain}/${messageId}.eml`

  let parsed: ParsedEmail
  if (envelope.archivedRawKey && envelope.raw) {
    parsed = await PostalMime.parse(envelope.raw, {
      attachmentEncoding: 'arraybuffer',
      maxNestingDepth: 20,
      maxHeadersSize: 512 * 1024,
    })
  } else if (envelope.rawBytes) {
    parsed = await parseAndArchiveRawBytes(env.RAW, rawKey, envelope.rawBytes, {
      mailbox: envelope.mailbox,
      direction: envelope.direction,
      source: envelope.source,
    })
  } else if (envelope.raw) {
    const [storageStream, parseStream] = envelope.raw.tee()
    const fixed = new FixedLengthStream(envelope.rawSize)
    const pipe = storageStream.pipeTo(fixed.writable)
    ;[parsed] = await Promise.all([
      PostalMime.parse(parseStream, {
        attachmentEncoding: 'arraybuffer',
        maxNestingDepth: 20,
        maxHeadersSize: 512 * 1024,
      }),
      env.RAW.put(rawKey, fixed.readable, {
        httpMetadata: { contentType: 'message/rfc822' },
        customMetadata: {
          mailbox: envelope.mailbox,
          direction: envelope.direction,
          source: envelope.source,
        },
      }),
      pipe,
    ])
  } else {
    throw new Error('Email content is missing.')
  }

  const rfcMessageId = normalizeMessageId(parsed.messageId)
  if (envelope.providerMessageId) {
    const duplicate = await env.DB.prepare(
      `SELECT id FROM messages
      WHERE inbox_id = ? AND provider_message_id = ?`,
    )
      .bind(route.inboxId, envelope.providerMessageId)
      .first<{ id: string }>()
    if (duplicate) {
      return { messageId: duplicate.id, duplicate: true }
    }
  }
  if (rfcMessageId) {
    const duplicate = await env.DB.prepare(
      'SELECT id FROM messages WHERE inbox_id = ? AND rfc_message_id = ?',
    )
      .bind(route.inboxId, rfcMessageId)
      .first<{ id: string }>()
    if (duplicate) {
      return { messageId: duplicate.id, duplicate: true }
    }
  }

  const existingThreadId = await findThreadId(env.DB, route.inboxId, parsed)
  const threadId = existingThreadId ?? newId('thr')
  const createdAt = nowIso()
  const at = receivedAt(parsed)
  const sender = firstEmailAddress(parsed.from) || envelope.from.toLowerCase()
  if (
    envelope.expectedSender &&
    sender !== envelope.expectedSender.toLowerCase()
  ) {
    throw new MailroomError(
      'INVALID_INPUT',
      `The imported sender ${sender || '(missing)'} does not match ${envelope.expectedSender}.`,
    )
  }
  const recipients = emailAddresses(parsed.to)
  if (
    envelope.direction === 'inbound' &&
    !recipients.includes(envelope.to.toLowerCase())
  ) {
    recipients.push(envelope.to.toLowerCase())
  }
  const cc = emailAddresses(parsed.cc)
  const subject = (parsed.subject ?? '').slice(0, 998)
  const normalizedSubject = normalizeSubject(subject)
  const text = (parsed.text ?? '').slice(0, MAX_TEXT_BODY)
  const html = (parsed.html ?? '').slice(0, MAX_HTML_BODY)
  const preview = plainTextPreview(text || subject)
  const attachments = await storeAttachments(env, messageId, parsed.attachments)
  const status = envelope.direction === 'inbound' ? 'unread' : 'read'

  const statements: D1PreparedStatement[] = []
  if (envelope.direction === 'outbound' && existingThreadId) {
    statements.push(markPriorInboundMessagesRead(env.DB, threadId, at))
  }
  if (!existingThreadId) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO threads
          (id, inbox_id, normalized_subject, latest_at, message_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`,
      ).bind(
        threadId,
        route.inboxId,
        normalizedSubject,
        at,
        createdAt,
        createdAt,
      ),
    )
  } else {
    statements.push(
      env.DB.prepare(
        `UPDATE threads SET latest_at = ?, message_count = message_count + 1,
          updated_at = ? WHERE id = ?`,
      ).bind(at, createdAt, threadId),
    )
  }
  statements.push(
    env.DB.prepare(
      `INSERT INTO messages (
        id, thread_id, inbox_id, direction, status, rfc_message_id,
        in_reply_to, message_references, sender, recipients, cc, subject,
        normalized_subject, preview, text_body, html_body, headers, raw_key,
        size_bytes, attachment_count, provider_message_id, received_at,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    ).bind(
      messageId,
      threadId,
      route.inboxId,
      envelope.direction,
      status,
      rfcMessageId,
      normalizeMessageId(parsed.inReplyTo),
      JSON.stringify(messageIdReferences(parsed.inReplyTo, parsed.references)),
      sender,
      JSON.stringify(recipients),
      JSON.stringify(cc),
      subject,
      normalizedSubject,
      preview,
      text,
      html || null,
      JSON.stringify(parsedHeaders(parsed)),
      rawKey,
      envelope.rawSize,
      attachments.length,
      envelope.providerMessageId ?? null,
      at,
      createdAt,
    ),
    env.DB.prepare(
      `INSERT INTO message_fts
        (message_id, inbox_id, subject, sender, body, classification)
      VALUES (?, ?, ?, ?, ?, '')`,
    ).bind(messageId, route.inboxId, subject, sender, text),
    ...attachments.map((attachment) =>
      env.DB.prepare(
        `INSERT INTO attachments
          (id, message_id, filename, content_type, content_id, disposition,
            size_bytes, r2_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        attachment.id,
        messageId,
        attachment.filename,
        attachment.contentType,
        attachment.contentId,
        attachment.disposition,
        attachment.sizeBytes,
        attachment.key,
        createdAt,
      ),
    ),
  )

  try {
    await batchOrThrow(env.DB, statements)
  } catch (error) {
    await Promise.all(
      attachments.map((attachment) => env.RAW.delete(attachment.key)),
    )
    throw error
  }

  executionCtx.waitUntil(
    Promise.all([
      indexMessage(env, {
        id: messageId,
        threadId,
        inboxId: route.inboxId,
        mailbox: envelope.mailbox.toLowerCase(),
        direction: envelope.direction,
        from: sender,
        to: recipients,
        cc,
        subject,
        text,
        receivedAt: at,
        status,
      }),
      ...(envelope.direction === 'inbound'
        ? [
            notifyTelegram(env, {
              id: messageId,
              from: sender,
              to: envelope.to,
              subject,
              preview,
            }),
          ]
        : []),
    ]).then(() => undefined),
  )

  return { messageId, duplicate: false }
}
