import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OperationContext } from '../types.js'

const mocks = vi.hoisted(() => ({
  sendOutbound: vi.fn(),
}))

vi.mock('../outbound.js', () => ({
  sendOutbound: mocks.sendOutbound,
}))

import { createDraft, draftRecipient, sendDraft } from './drafts.js'

describe('draftRecipient', () => {
  it('replies to the first valid Reply-To address', () => {
    expect(
      draftRecipient({
        sender: 'notifications@keep.md',
        message_reply_to: 'Ian Nuttall <ianpaulnuttall@gmail.com>',
      }),
    ).toBe('ianpaulnuttall@gmail.com')
  })

  it('falls back to the sender without Reply-To', () => {
    expect(
      draftRecipient({
        sender: 'sender@example.com',
        message_reply_to: null,
      }),
    ).toBe('sender@example.com')
  })
})

describe('createDraft', () => {
  it('accepts currency symbols and web links as normal content', async () => {
    const prepared: Array<{ sql: string; values: unknown[] }> = []
    const sourceMessage = {
      id: 'msg_source',
      thread_id: 'thr_source',
      local_part: 'hello',
      domain: 'example.com',
      from_address: 'hello@example.com',
      reply_to: null,
      sender: 'reader@example.com',
      subject: 'Question',
      message_reply_to: null,
    }
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            const statement = {
              sql,
              values,
              first: async () => sourceMessage,
            }
            prepared.push(statement)
            return statement
          },
        }
      },
      batch: async (statements: unknown[]) =>
        statements.map(() => ({ success: true })),
    }
    const context = {
      env: { DB: db },
      executionCtx: { waitUntil: () => undefined },
      requestId: 'req_test',
    } as unknown as OperationContext
    const text =
      'Prices can be $500, £400, or €450. See https://example.com/details.'

    const result = await createDraft(context, {
      messageId: 'msg_source',
      text,
      source: 'agent',
    })

    expect(result).toMatchObject({
      status: 'pending',
      sender: 'hello@example.com',
      recipient: 'reader@example.com',
    })
    const insert = prepared.find(({ sql }) =>
      sql.includes('INSERT INTO drafts'),
    )
    expect(insert?.values).toContain(text)
  })
})

describe('sendDraft', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.sendOutbound.mockResolvedValue({
      messageId: '<mailroom-reply@example.com>',
    })
  })

  it('marks prior inbound messages in the thread read after sending', async () => {
    const batches: Array<Array<{ sql: string; values: unknown[] }>> = []
    const waits: Promise<unknown>[] = []
    const draft = {
      id: 'drf_test',
      message_id: 'msg_source',
      thread_id: 'thr_test',
      status: 'approved',
      recipient: 'reader@example.net',
      sender: 'support@example.com',
      reply_to: null,
      subject: 'Re: Question',
      text_body: 'The answer.',
      html_body: null,
      rfc_message_id: '<original@example.net>',
      message_references: '[]',
      inbox_id: 'inb_test',
      relay_url: null,
    }
    const db = {
      prepare(sql: string) {
        return {
          bind(...values: unknown[]) {
            return {
              sql,
              values,
              first: async () =>
                sql.includes('FROM outbound_attempts') ? null : draft,
              run: async () => ({ success: true }),
            }
          },
        }
      },
      async batch(statements: Array<{ sql: string; values: unknown[] }>) {
        batches.push(statements)
        return statements.map(() => ({ success: true }))
      },
    }
    const context = {
      env: {
        DB: db,
        AI_SEARCH: {
          items: { upload: vi.fn().mockResolvedValue(undefined) },
        },
      },
      executionCtx: {
        waitUntil(promise: Promise<unknown>) {
          waits.push(promise)
        },
      },
      requestId: 'req_test',
    } as unknown as OperationContext

    const result = (await sendDraft(context, {
      id: 'drf_test',
      idempotencyKey: 'send-test',
    })) as { sentAt: string }
    await Promise.all(waits)

    const update = batches[1]?.find(({ sql }) =>
      sql.includes("UPDATE messages SET status = 'read'"),
    )
    expect(update?.sql).toContain("direction = 'inbound'")
    expect(update?.sql).toContain("status = 'unread'")
    expect(update?.sql).toContain('received_at <= ?')
    expect(update?.values).toEqual(['thr_test', result.sentAt])
  })
})
