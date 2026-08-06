import { afterEach, describe, expect, it, vi } from 'vitest'
import { allowedFromDomain, relayInbound } from './index.js'

describe('outbound domain allowlist', () => {
  it('requires an exact normalized domain match', () => {
    expect(allowedFromDomain('ian.is, swipe.md', 'Ian@SWIPE.MD')).toBe(true)
    expect(allowedFromDomain('swipe.md', 'ian@attacker-swipe.md')).toBe(false)
  })
})

describe('inbound relay', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('stores centrally before forwarding to the domain Gmail destination', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    const forward = vi.fn().mockResolvedValue(undefined)
    const raw = 'From: sender@example.com\r\nTo: support@keep.md\r\n\r\nHelp'

    await relayInbound(
      {
        from: 'sender@example.com',
        to: 'support@keep.md',
        rawSize: new TextEncoder().encode(raw).byteLength,
        raw: new Blob([raw]).stream(),
        headers: new Headers({ 'message-id': '<keep-test@example.com>' }),
        forward,
      } as never,
      {
        CENTRAL_MAILROOM_URL: 'https://mailroom.example.com',
        INGRESS_SECRET: 'test-secret',
        MAX_EMAIL_BYTES: '26214400',
        MAILROOM_FORWARD_TO_BY_DOMAIN: JSON.stringify({
          'keep.md': 'owner+keep@gmail.com',
        }),
      } as never,
    )

    expect(fetch).toHaveBeenCalledOnce()
    const request = fetch.mock.calls[0]?.[1] as RequestInit
    expect(request.method).toBe('POST')
    expect(
      (request.headers as Record<string, string>)['x-mailroom-signature'],
    ).toMatch(/^[a-f0-9]{64}$/)
    expect(forward).toHaveBeenCalledWith('owner+keep@gmail.com')
  })

  it('does not forward when the central Worker rejects the message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('forbidden', { status: 403 })),
    )
    const forward = vi.fn()
    const raw = 'From: sender@example.com\r\nTo: support@keep.md\r\n\r\nHelp'

    await expect(
      relayInbound(
        {
          from: 'sender@example.com',
          to: 'support@keep.md',
          rawSize: new TextEncoder().encode(raw).byteLength,
          raw: new Blob([raw]).stream(),
          headers: new Headers(),
          forward,
        } as never,
        {
          CENTRAL_MAILROOM_URL: 'https://mailroom.example.com',
          INGRESS_SECRET: 'test-secret',
          MAX_EMAIL_BYTES: '26214400',
          MAILROOM_FORWARD_TO: 'owner@gmail.com',
        } as never,
      ),
    ).rejects.toThrow('Central Mailroom rejected the email (403)')
    expect(forward).not.toHaveBeenCalled()
  })

  it('stores automatic replies without forwarding them to Gmail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const forward = vi.fn()
    const raw = 'From: sender@example.com\r\nTo: support@keep.md\r\n\r\nAway'

    await relayInbound(
      {
        from: 'sender@example.com',
        to: 'support@keep.md',
        rawSize: new TextEncoder().encode(raw).byteLength,
        raw: new Blob([raw]).stream(),
        headers: new Headers({ 'auto-submitted': 'auto-replied' }),
        forward,
      } as never,
      {
        CENTRAL_MAILROOM_URL: 'https://mailroom.example.com',
        INGRESS_SECRET: 'test-secret',
        MAX_EMAIL_BYTES: '26214400',
        MAILROOM_FORWARD_TO: 'owner@gmail.com',
      } as never,
    )

    expect(forward).not.toHaveBeenCalled()
  })
})
