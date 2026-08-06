import { describe, expect, it, vi } from 'vitest'
import { parseAndArchiveRawBytes } from './ingest.js'

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
