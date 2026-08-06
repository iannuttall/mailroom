import { describe, expect, it } from 'vitest'
import { draftRecipient } from './drafts.js'

describe('draftRecipient', () => {
  it('replies to the first valid Reply-To address', () => {
    expect(
      draftRecipient({
        sender: 'notifications@keep.md',
        headers: JSON.stringify({
          'reply-to': ['Ian Nuttall <ianpaulnuttall@gmail.com>'],
        }),
      }),
    ).toBe('ianpaulnuttall@gmail.com')
  })

  it('falls back to the sender without Reply-To', () => {
    expect(
      draftRecipient({
        sender: 'sender@example.com',
        headers: '{}',
      }),
    ).toBe('sender@example.com')
  })
})
