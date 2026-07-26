import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMessageSearchDocument,
  messageIdReferences,
  normalizeMessageId,
  normalizeSubject,
} from './email.js'

test('normalizes reply subjects and message ids', () => {
  assert.equal(
    normalizeSubject('Re: FWD:  Sponsorship idea  '),
    'sponsorship idea',
  )
  assert.equal(normalizeMessageId('abc@example.com'), '<abc@example.com>')
  assert.deepEqual(
    messageIdReferences(
      '<one@example.com>',
      '<two@example.com> <one@example.com>',
    ),
    ['<one@example.com>', '<two@example.com>'],
  )
})

test('search documents keep metadata separate from the message', () => {
  const document = createMessageSearchDocument({
    id: 'message-1',
    threadId: 'thread-1',
    direction: 'inbound',
    mailbox: 'ian@example.com',
    from: 'person@example.net',
    to: ['ian@example.com'],
    subject: 'A useful sponsorship',
    text: 'Could we sponsor next week?',
    receivedAt: '2026-07-26T12:00:00.000Z',
    status: 'unread',
    classification: 'sponsorship',
  })

  assert.match(document, /^# A useful sponsorship/)
  assert.match(document, /## Message\n\nCould we sponsor next week\?/)
  assert.match(document, /- Classification: sponsorship/)
})
