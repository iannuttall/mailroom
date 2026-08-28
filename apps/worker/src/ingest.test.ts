import { describe, expect, it, vi } from 'vitest'
import { ingestEmail, parseAndArchiveRawBytes } from './ingest.js'

type Statement = {
  sql: string
  values: unknown[]
  first: () => Promise<unknown>
  run: () => Promise<{ success: boolean }>
}

function ingestHarness() {
  const batches: Statement[][] = []
  const waits: Promise<unknown>[] = []
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          const statement: Statement = {
            sql,
            values,
            first: async () => {
              if (sql.includes('FROM routes r')) {
                return {
                  route_id: 'rte_test',
                  inbox_id: 'inb_test',
                  domain_id: 'dom_test',
                  domain: 'example.com',
                  kind: 'exact',
                  local_part: 'support',
                  enabled: 1,
                  priority: 0,
                  inbox_enabled: 1,
                }
              }
              if (sql.includes('rfc_message_id IN')) {
                return { thread_id: 'thr_test' }
              }
              return null
            },
            run: async () => ({ success: true }),
          }
          return statement
        },
      }
    },
    async batch(statements: Statement[]) {
      batches.push(statements)
      return statements.map(() => ({ success: true }))
    },
  }
  const env = {
    DB: db,
    RAW: {
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    AI_SEARCH: {
      items: { upload: vi.fn().mockResolvedValue(undefined) },
    },
    MAX_EMAIL_BYTES: '26214400',
  } as unknown as Env
  const executionCtx = {
    waitUntil(promise: Promise<unknown>) {
      waits.push(promise)
    },
  }
  return { batches, env, executionCtx, waits }
}

function replyRaw(options: {
  direction: 'inbound' | 'outbound'
  date: string
  messageId: string
}): ArrayBuffer {
  const from =
    options.direction === 'outbound'
      ? 'support@example.com'
      : 'reader@example.net'
  const to =
    options.direction === 'outbound'
      ? 'reader@example.net'
      : 'support@example.com'
  return new TextEncoder().encode(
    [
      `From: ${from}`,
      `To: ${to}`,
      'Subject: Re: Question',
      `Date: ${options.date}`,
      `Message-ID: <${options.messageId}>`,
      'In-Reply-To: <original@example.net>',
      '',
      'A reply.',
    ].join('\r\n'),
  ).buffer
}

describe('relayed raw email storage', () => {
  it('parses and archives the original byte buffer without stream piping', async () => {
    const source = [
      'From: sender@example.com',
      'To: support@example.com',
      'Subject: Relay bytes',
      'Message-ID: <relay-bytes@example.com>',
      '',
      'Hello from the relay.',
    ].join('\r\n')
    const raw = new TextEncoder().encode(source).buffer
    const put = vi.fn().mockResolvedValue(undefined)

    const parsed = await parseAndArchiveRawBytes(
      { put } as never,
      'raw/example.com/msg_test.eml',
      raw,
      {
        mailbox: 'support@example.com',
        direction: 'inbound',
        source: 'relay',
      },
    )

    expect(parsed.subject).toBe('Relay bytes')
    expect(parsed.text).toContain('Hello from the relay.')
    expect(put).toHaveBeenCalledWith('raw/example.com/msg_test.eml', raw, {
      httpMetadata: { contentType: 'message/rfc822' },
      customMetadata: {
        mailbox: 'support@example.com',
        direction: 'inbound',
        source: 'relay',
      },
    })
  })
})

describe('thread read state', () => {
  it('marks prior inbound messages read when Gmail sent-sync stores a reply', async () => {
    const harness = ingestHarness()
    const rawBytes = replyRaw({
      direction: 'outbound',
      date: 'Tue, 25 Aug 2026 10:00:00 +0000',
      messageId: 'sent@example.com',
    })

    await ingestEmail(harness.env, harness.executionCtx, {
      from: 'support@example.com',
      to: 'support@example.com',
      mailbox: 'support@example.com',
      direction: 'outbound',
      rawBytes,
      rawSize: rawBytes.byteLength,
      headers: new Headers(),
      source: 'gmail-sent',
      providerMessageId: 'gmail-sent-id',
      expectedSender: 'support@example.com',
    })
    await Promise.all(harness.waits)

    const update = harness.batches[0]?.find(({ sql }) =>
      sql.includes("UPDATE messages SET status = 'read'"),
    )
    expect(update?.sql).toContain("direction = 'inbound'")
    expect(update?.sql).toContain("status = 'unread'")
    expect(update?.sql).toContain('received_at <= ?')
    expect(update?.values).toEqual(['thr_test', '2026-08-25T10:00:00.000Z'])
  })

  it('keeps a new inbound reply unread after an outbound reply', async () => {
    const harness = ingestHarness()
    const rawBytes = replyRaw({
      direction: 'inbound',
      date: 'Tue, 25 Aug 2026 10:05:00 +0000',
      messageId: 'new-inbound@example.net',
    })

    await ingestEmail(harness.env, harness.executionCtx, {
      from: 'reader@example.net',
      to: 'support@example.com',
      mailbox: 'support@example.com',
      direction: 'inbound',
      rawBytes,
      rawSize: rawBytes.byteLength,
      headers: new Headers(),
      source: 'relay',
      providerMessageId: 'new-inbound-id',
    })
    await Promise.all(harness.waits)

    expect(
      harness.batches[0]?.some(({ sql }) =>
        sql.includes("UPDATE messages SET status = 'read'"),
      ),
    ).toBe(false)
    const insert = harness.batches[0]?.find(({ sql }) =>
      sql.includes('INSERT INTO messages'),
    )
    expect(insert?.values[4]).toBe('unread')
  })
})
