import { describe, expect, it, vi } from 'vitest'
import { forwardStoredEmail, resolveForwardDestination } from './forwarding.js'

describe('inbound forwarding', () => {
  it('uses the destination configured for the recipient domain', () => {
    expect(
      resolveForwardDestination(
        'Anything@IAN.IS',
        JSON.stringify({
          'ian.is': 'ianpaulnuttall+ianis@gmail.com',
          'swipe.md': 'ianpaulnuttall+swipe@gmail.com',
        }),
        'owner@gmail.com',
      ),
    ).toBe('ianpaulnuttall+ianis@gmail.com')
  })

  it('uses the fallback for an unmapped domain or invalid mapping', () => {
    expect(
      resolveForwardDestination(
        'anything@example.com',
        JSON.stringify({ 'ian.is': 'ianpaulnuttall+ianis@gmail.com' }),
        'owner@gmail.com',
      ),
    ).toBe('owner@gmail.com')

    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(
      resolveForwardDestination(
        'anything@ian.is',
        'not-json',
        'owner@gmail.com',
      ),
    ).toBe('owner@gmail.com')
    expect(error).toHaveBeenCalledWith(
      'mailroom_forwarding_config_invalid',
      expect.objectContaining({ error: expect.any(String) }),
    )
    error.mockRestore()
  })

  it('forwards a newly stored message to the configured destination', async () => {
    const forward = vi.fn().mockResolvedValue({ messageId: 'forwarded' })

    await expect(
      forwardStoredEmail(
        { to: 'anything@example.com', forward },
        'owner@gmail.com',
        false,
      ),
    ).resolves.toBe(true)
    expect(forward).toHaveBeenCalledWith('owner@gmail.com')
  })

  it('does not forward duplicate messages or messages without a destination', async () => {
    const forward = vi.fn()
    const message = { to: 'anything@example.com', forward }

    await expect(
      forwardStoredEmail(message, 'owner@gmail.com', true),
    ).resolves.toBe(false)
    await expect(forwardStoredEmail(message, undefined, false)).resolves.toBe(
      false,
    )
    expect(forward).not.toHaveBeenCalled()
  })

  it('keeps the stored message when forwarding fails', async () => {
    const forward = vi.fn().mockRejectedValue(new Error('not verified'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      forwardStoredEmail(
        { to: 'anything@example.com', forward },
        'owner@gmail.com',
        false,
      ),
    ).resolves.toBe(false)
    expect(error).toHaveBeenCalledWith(
      'mailroom_email_forward_failed',
      expect.objectContaining({ recipient: 'anything@example.com' }),
    )
    error.mockRestore()
  })
})
