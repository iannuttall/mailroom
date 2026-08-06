import assert from 'node:assert/strict'
import test from 'node:test'
import { isAutomaticReply, resolveForwardDestination } from './email-routing.js'

test('domain forwarding prefers the exact domain mapping', () => {
  assert.equal(
    resolveForwardDestination(
      'Anything@IAN.IS',
      JSON.stringify({
        'ian.is': 'owner+ianis@gmail.com',
        'swipe.md': 'owner+swipe@gmail.com',
      }),
      'owner@gmail.com',
    ),
    'owner+ianis@gmail.com',
  )
  assert.equal(
    resolveForwardDestination(
      'anything@example.com',
      JSON.stringify({ 'ian.is': 'owner+ianis@gmail.com' }),
      'owner@gmail.com',
    ),
    'owner@gmail.com',
  )
})

test('automatic reply detection catches standard and Outlook replies', () => {
  assert.equal(
    isAutomaticReply(new Headers({ 'Auto-Submitted': 'auto-replied' })),
    true,
  )
  assert.equal(
    isAutomaticReply(
      new Headers({
        'Auto-Submitted': 'auto-generated',
        'X-MS-Exchange-Generated-Message-Source': 'Mailbox Rules Agent',
      }),
    ),
    true,
  )
  assert.equal(
    isAutomaticReply(new Headers({ 'Auto-Submitted': 'auto-generated' })),
    false,
  )
})
