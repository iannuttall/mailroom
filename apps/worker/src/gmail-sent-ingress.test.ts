import {
  type MailroomError,
  sha256Hex,
  signImportRequest,
} from '@mailroom/core'
import { describe, expect, it } from 'vitest'
import { authenticateGmailSentEmail } from './gmail-sent-ingress.js'

const raw = [
  'From: Ian <me@ian.is>',
  'To: reader@example.com',
  'Subject: Test',
  'Message-ID: <gmail-test@example.com>',
  '',
  'Hello',
].join('\r\n')

async function signedRequest(body = raw): Promise<Request> {
  const account = 'ianpaulnuttall@gmail.com'
  const mailbox = 'me@ian.is'
  const providerMessageId = '18e829f'
  const idempotencyKey = `gmail-sent:${account}:${providerMessageId}`
  const timestamp = String(Date.now())
  const bodySha256 = await sha256Hex(body)
  const signature = await signImportRequest('sync-secret', {
    timestamp,
    idempotencyKey,
    source: 'gmail-sent',
    account,
    providerMessageId,
    mailbox,
    bodySha256,
  })
  return new Request('https://mailroom.example/v1/ingress/gmail-sent', {
    method: 'POST',
    headers: {
      'content-type': 'message/rfc822',
      'x-mailroom-timestamp': timestamp,
      'x-mailroom-idempotency-key': idempotencyKey,
      'x-mailroom-account': account,
      'x-mailroom-provider-message-id': providerMessageId,
      'x-mailroom-mailbox': mailbox,
      'x-mailroom-body-sha256': bodySha256,
      'x-mailroom-signature': signature,
    },
    body,
  })
}

describe('Gmail Sent ingress authentication', () => {
  it('accepts a signed raw Gmail message', async () => {
    const result = await authenticateGmailSentEmail(await signedRequest(), {
      GMAIL_SYNC_SECRET: 'sync-secret',
      MAX_EMAIL_BYTES: '26214400',
    })

    expect(result.account).toBe('ianpaulnuttall@gmail.com')
    expect(result.mailbox).toBe('me@ian.is')
    expect(result.providerMessageId).toBe('18e829f')
    expect(result.body.byteLength).toBe(
      new TextEncoder().encode(raw).byteLength,
    )
  })

  it('rejects a message whose signed body hash was changed', async () => {
    const request = await signedRequest()
    const headers = new Headers(request.headers)
    const changed = new Request(request.url, {
      method: 'POST',
      headers,
      body: `${raw} changed`,
    })

    await expect(
      authenticateGmailSentEmail(changed, {
        GMAIL_SYNC_SECRET: 'sync-secret',
        MAX_EMAIL_BYTES: '26214400',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<MailroomError>)
  })

  it('stays disabled until its separate secret is configured', async () => {
    await expect(
      authenticateGmailSentEmail(await signedRequest(), {
        GMAIL_SYNC_SECRET: '',
        MAX_EMAIL_BYTES: '26214400',
      }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    } satisfies Partial<MailroomError>)
  })
})
