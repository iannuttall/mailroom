import { describe, expect, it } from 'vitest'
import type { OperationContext } from '../types.js'
import { createDraft, draftRecipient } from './drafts.js'

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
