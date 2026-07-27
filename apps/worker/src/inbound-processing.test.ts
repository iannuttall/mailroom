import { describe, expect, it, vi } from 'vitest'
import {
  enqueueInboundMarker,
  sweepPendingInbound,
} from './inbound-processing.js'

describe('inbound recovery', () => {
  it('leaves recovery to the marker when immediate enqueue fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const env = {
      INGEST_QUEUE: {
        send: vi.fn().mockRejectedValue(new Error('Queue unavailable')),
      },
    } as unknown as Env

    await expect(
      enqueueInboundMarker(env, 'pending/inbound/example.json'),
    ).resolves.toBe(false)
    expect(error).toHaveBeenCalledWith(
      'mailroom_queue_enqueue_failed',
      expect.objectContaining({
        markerKey: 'pending/inbound/example.json',
      }),
    )
    error.mockRestore()
  })

  it('re-enqueues every pending marker found by the scheduled sweep', async () => {
    const sendBatch = vi.fn().mockResolvedValue(undefined)
    const env = {
      RAW: {
        list: vi.fn().mockResolvedValue({
          objects: [
            { key: 'pending/inbound/one.json' },
            { key: 'pending/inbound/two.json' },
          ],
          truncated: false,
        }),
      },
      INGEST_QUEUE: { sendBatch },
    } as unknown as Env

    await expect(sweepPendingInbound(env)).resolves.toBe(2)
    expect(sendBatch).toHaveBeenCalledWith([
      { body: { markerKey: 'pending/inbound/one.json' } },
      { body: { markerKey: 'pending/inbound/two.json' } },
    ])
  })
})
