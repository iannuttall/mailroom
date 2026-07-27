import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('./Code.js', import.meta.url), 'utf8')
const manifest = JSON.parse(
  await readFile(new URL('./appsscript.json', import.meta.url), 'utf8'),
)
const context = vm.createContext({})
vm.runInContext(source, context)

test('builds a bounded Gmail Sent query', () => {
  assert.equal(context.buildSearchQuery(1_700_000_000), 'after:1700000000')
})

test('uses the 24-hour lookback when the sync cursor is absent', () => {
  assert.equal(
    context.syncAfter(null, 1_700_000_000),
    1_700_000_000 - 24 * 60 * 60,
  )
})

test('overlaps an existing sync cursor by ten minutes', () => {
  assert.equal(
    context.syncAfter('1700000000', 1_700_100_000),
    1_700_000_000 - 10 * 60,
  )
})

test('extracts a folded From header and normalizes its address', () => {
  const raw = [
    'From: Ian Nuttall',
    ' <Me@Ian.Is>',
    'To: someone@example.com',
    'Subject: Hello',
    '',
    'Body',
  ].join('\r\n')
  const from = context.extractHeaderFromText(raw, 'From')
  assert.equal(context.extractEmailAddress(from), 'me@ian.is')
})

test('extracts a From address from Gmail metadata', () => {
  assert.equal(
    context.mailboxFromMetadata({
      payload: {
        headers: [
          { name: 'Subject', value: 'Hello' },
          { name: 'From', value: 'Ian Nuttall <Me@Ian.Is>' },
        ],
      },
    }),
    'me@ian.is',
  )
})

test('pads Gmail URL-safe base64 before Apps Script decodes it', () => {
  assert.equal(context.padWebSafeBase64('YWJj'), 'YWJj')
  assert.equal(context.padWebSafeBase64('YWI'), 'YWI=')
  assert.equal(context.padWebSafeBase64('YQ'), 'YQ==')
})

test('uses byte arrays returned by the Apps Script Gmail service directly', () => {
  const bytes = [70, 114, 111, 109]
  assert.deepEqual(Array.from(context.gmailRawBytes(bytes)), bytes)
})

test('matches the Worker import canonical request', () => {
  assert.equal(
    context.buildCanonicalImport({
      timestamp: '1700000000000',
      idempotencyKey: 'gmail-sent:user@gmail.com:18e829f',
      account: 'USER@gmail.com',
      providerMessageId: '18e829f',
      mailbox: 'ME@ian.is',
      bodySha256: 'ABC123',
    }),
    [
      'mailroom-import-v1',
      '1700000000000',
      'gmail-sent:user@gmail.com:18e829f',
      'gmail-sent',
      'user@gmail.com',
      '18e829f',
      'me@ian.is',
      'abc123',
    ].join('\n'),
  )
})

test('requests read-only Gmail access and enables the Gmail service', () => {
  assert.ok(
    manifest.oauthScopes.includes(
      'https://www.googleapis.com/auth/gmail.readonly',
    ),
  )
  assert.ok(!manifest.oauthScopes.includes('https://mail.google.com/'))
  assert.equal(
    manifest.dependencies.enabledAdvancedServices[0].serviceId,
    'gmail',
  )
})
