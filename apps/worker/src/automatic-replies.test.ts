import { describe, expect, it } from 'vitest'
import { isAutomaticReply } from './automatic-replies.js'

describe('automatic reply detection', () => {
  it('detects replies identified by the standard header', () => {
    expect(
      isAutomaticReply(
        new Headers({
          'Auto-Submitted': 'auto-replied',
        }),
      ),
    ).toBe(true)
  })

  it('detects common explicit auto-reply headers', () => {
    expect(isAutomaticReply(new Headers({ 'X-Autoreply': 'yes' }))).toBe(true)
    expect(isAutomaticReply(new Headers({ 'X-Autorespond': 'true' }))).toBe(
      true,
    )
  })

  it('detects the Outlook out-of-office message received from the campaign', () => {
    expect(
      isAutomaticReply(
        new Headers({
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
          'X-MS-Exchange-Generated-Message-Source': 'Mailbox Rules Agent',
          'X-MS-Exchange-Inbox-Rules-Loop': 'person@example.com',
        }),
      ),
    ).toBe(true)
  })

  it('does not suppress ordinary automated notifications', () => {
    expect(
      isAutomaticReply(
        new Headers({
          'Auto-Submitted': 'auto-generated',
          'X-Auto-Response-Suppress': 'All',
        }),
      ),
    ).toBe(false)
    expect(
      isAutomaticReply(
        new Headers({
          'Auto-Submitted': 'no',
          'X-Autoreply': 'no',
          'X-Autorespond': 'false',
        }),
      ),
    ).toBe(false)
  })
})
