import { describe, expect, it, vi } from 'vitest'
import { archiveInboundEmail, inboundMarkerKey } from './inbound-archive.js'

function rawEmail(): Uint8Array {
  return new TextEncoder().encode(
    [
      'Message-ID: <durable@example.com>',
      'From: Sender <sender@example.com>',
      'To: anything@ian.is',
      'Subject: Durable',
      '',
      'Keep this.',
    ].join('\r\n'),
  )
}

function message(bytes: Uint8Array) {
  return {
    from: 'sender@example.com',
    to: 'anything@ian.is',
    raw: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes)
        controller.close()
      },
    }),
    rawSize: bytes.byteLength,
    headers: new Headers({
      'message-id': '<durable@example.com>',
      subject: 'Durable',
    }),
  }
}

describe('inbound archive', () => {
  it('stores the raw message before its pending marker', async () => {
    const bytes = rawEmail()
    const stored = new Map<string, Uint8Array | string>()
    const calls: string[] = []
    const bucket = {
      head: vi.fn().mockResolvedValue(null),
      put: vi.fn(async (key: string, value: ArrayBuffer | string) => {
        calls.push(key)
        if (typeof value === 'string') {
          stored.set(key, value)
          return {}
        }
        stored.set(key, new Uint8Array(value))
        return {}
      }),
    }

    const result = await archiveInboundEmail(
      {
        RAW: bucket,
        MAX_EMAIL_BYTES: '26214400',
      } as unknown as Env,
      message(bytes),
    )

    expect(calls).toEqual([result.job.rawKey, result.markerKey])
    expect(stored.get(result.job.rawKey)).toEqual(bytes)
    expect(result.markerKey).toBe(inboundMarkerKey(result.job.archiveId))
    expect(JSON.parse(stored.get(result.markerKey) as string)).toMatchObject({
      archiveId: result.job.archiveId,
      rawKey: result.job.rawKey,
      mailbox: 'anything@ian.is',
    })
  })

  it('does not create a marker when raw storage fails', async () => {
    const bytes = rawEmail()
    const bucket = {
      head: vi.fn().mockResolvedValue(null),
      put: vi.fn(async (key: string, value: ArrayBuffer | string) => {
        if (typeof value !== 'string') {
          throw new Error(`R2 unavailable for ${key}`)
        }
        return {}
      }),
    }

    await expect(
      archiveInboundEmail(
        {
          RAW: bucket,
          MAX_EMAIL_BYTES: '26214400',
        } as unknown as Env,
        message(bytes),
      ),
    ).rejects.toThrow('R2 unavailable')
    expect(bucket.put).toHaveBeenCalledTimes(1)
  })

  it('keeps distinct raw messages even when a sender reuses Message-ID', async () => {
    const keys: string[] = []
    const bucket = {
      head: vi.fn().mockResolvedValue(null),
      put: vi.fn(async (key: string) => {
        keys.push(key)
        return {}
      }),
    }
    const env = {
      RAW: bucket,
      MAX_EMAIL_BYTES: '26214400',
    } as unknown as Env
    const first = rawEmail()
    const second = new Uint8Array(first)
    second[second.byteLength - 1] = '!'.charCodeAt(0)

    const firstResult = await archiveInboundEmail(env, message(first))
    const secondResult = await archiveInboundEmail(env, message(second))

    expect(firstResult.job.archiveId).not.toBe(secondResult.job.archiveId)
    expect(keys).toContain(firstResult.job.rawKey)
    expect(keys).toContain(secondResult.job.rawKey)
  })
})
