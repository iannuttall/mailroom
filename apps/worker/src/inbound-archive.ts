const RAW_PREFIX = 'raw/inbound'
export const PENDING_INBOUND_PREFIX = 'pending/inbound/'

export type InboundArchiveJob = {
  version: 1
  archiveId: string
  archivedAt: string
  rawKey: string
  from: string
  to: string
  mailbox: string
  rawSize: number
  headers: [string, string][]
}

type InboundMessage = Pick<
  ForwardableEmailMessage,
  'from' | 'to' | 'raw' | 'rawSize' | 'headers'
>

function safeDomain(address: string): string {
  const domain = address.split('@').at(-1)?.trim().toLowerCase()
  if (!domain || !/^[a-z0-9.-]+$/.test(domain)) return 'unknown'
  return domain
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return hex(digest)
}

async function sha256Bytes(value: ArrayBuffer): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', value))
}

function hex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

async function archiveId(
  message: InboundMessage,
  raw: ArrayBuffer,
): Promise<string> {
  const rawHash = await sha256Bytes(raw)
  return sha256(`${message.to.trim().toLowerCase()}\n${rawHash}`)
}

async function putRawMessage(
  bucket: R2Bucket,
  key: string,
  message: InboundMessage,
  raw: ArrayBuffer,
): Promise<void> {
  if (await bucket.head(key)) return

  await bucket.put(key, raw, {
    httpMetadata: { contentType: 'message/rfc822' },
    customMetadata: {
      mailbox: message.to.toLowerCase(),
      direction: 'inbound',
      source: 'email-routing',
    },
  })
}

export function inboundMarkerKey(archiveIdValue: string): string {
  return `${PENDING_INBOUND_PREFIX}${archiveIdValue}.json`
}

export async function archiveInboundEmail(
  env: Env,
  message: InboundMessage,
): Promise<{ job: InboundArchiveJob; markerKey: string }> {
  const maxBytes = Number(env.MAX_EMAIL_BYTES)
  if (
    !Number.isFinite(message.rawSize) ||
    message.rawSize <= 0 ||
    message.rawSize > maxBytes
  ) {
    throw new Error(
      `Email size ${message.rawSize} is outside the allowed range.`,
    )
  }

  const raw = await new Response(message.raw).arrayBuffer()
  if (!raw.byteLength || raw.byteLength > maxBytes) {
    throw new Error(
      `Email body size ${raw.byteLength} is outside the allowed range.`,
    )
  }

  const id = await archiveId(message, raw)
  const rawKey = `${RAW_PREFIX}/${safeDomain(message.to)}/${id}.eml`
  const markerKey = inboundMarkerKey(id)
  const job: InboundArchiveJob = {
    version: 1,
    archiveId: id,
    archivedAt: new Date().toISOString(),
    rawKey,
    from: message.from,
    to: message.to,
    mailbox: message.to,
    rawSize: raw.byteLength,
    headers: Array.from(message.headers.entries()),
  }

  await putRawMessage(env.RAW, rawKey, message, raw)
  await env.RAW.put(markerKey, JSON.stringify(job), {
    httpMetadata: { contentType: 'application/json' },
    customMetadata: { rawKey, mailbox: message.to.toLowerCase() },
  })

  return { job, markerKey }
}

export function isInboundArchiveJob(
  value: unknown,
): value is InboundArchiveJob {
  if (!value || typeof value !== 'object') return false
  const job = value as Partial<InboundArchiveJob>
  return (
    job.version === 1 &&
    typeof job.archiveId === 'string' &&
    typeof job.rawKey === 'string' &&
    typeof job.from === 'string' &&
    typeof job.to === 'string' &&
    typeof job.mailbox === 'string' &&
    typeof job.rawSize === 'number' &&
    Array.isArray(job.headers)
  )
}
