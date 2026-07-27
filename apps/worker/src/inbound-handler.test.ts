import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  archive: vi.fn(),
  enqueue: vi.fn(),
  forward: vi.fn(),
}))

vi.mock('./inbound-archive.js', () => ({
  archiveInboundEmail: mocks.archive,
}))
vi.mock('./inbound-processing.js', () => ({
  enqueueInboundMarker: mocks.enqueue,
}))
vi.mock('./forwarding.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./forwarding.js')>()
  return {
    ...actual,
    forwardStoredEmail: mocks.forward,
  }
})

import { handleInboundEmail } from './inbound-handler.js'

function emailMessage(): ForwardableEmailMessage {
  return {
    from: 'sender@example.com',
    to: 'anything@ian.is',
  } as ForwardableEmailMessage
}

describe('inbound handler', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.forward.mockResolvedValue(true)
    mocks.enqueue.mockResolvedValue(true)
  })

  it('still forwards and requests an SMTP retry when raw archiving fails', async () => {
    const failure = new Error('R2 unavailable')
    mocks.archive.mockRejectedValue(failure)
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await expect(
      handleInboundEmail(emailMessage(), {
        MAILROOM_FORWARD_TO: 'owner@gmail.com',
        MAILROOM_FORWARD_TO_BY_DOMAIN:
          '{"ian.is":"ianpaulnuttall+ianis@gmail.com"}',
      } as Env),
    ).rejects.toBe(failure)
    expect(mocks.forward).toHaveBeenCalledOnce()
    expect(mocks.forward).toHaveBeenCalledWith(
      expect.anything(),
      'ianpaulnuttall+ianis@gmail.com',
      false,
    )
    expect(mocks.enqueue).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('acknowledges archived mail when forwarding and immediate enqueue fail', async () => {
    mocks.archive.mockResolvedValue({
      markerKey: 'pending/inbound/example.json',
    })
    mocks.forward.mockResolvedValue(false)
    mocks.enqueue.mockResolvedValue(false)

    await expect(
      handleInboundEmail(emailMessage(), {
        MAILROOM_FORWARD_TO: 'owner@gmail.com',
        MAILROOM_FORWARD_TO_BY_DOMAIN:
          '{"ian.is":"ianpaulnuttall+ianis@gmail.com"}',
      } as Env),
    ).resolves.toBeUndefined()
    expect(mocks.forward).toHaveBeenCalledOnce()
    expect(mocks.enqueue).toHaveBeenCalledWith(
      expect.anything(),
      'pending/inbound/example.json',
    )
  })
})
