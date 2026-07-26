const encoder = new TextEncoder()

export type SignedIngressHeaders = {
  timestamp: string
  idempotencyKey: string
  from: string
  to: string
  bodySha256: string
}

export type SignedRelayHeaders = {
  timestamp: string
  idempotencyKey: string
  method: string
  path: string
  bodySha256: string
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array | undefined {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    const value = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
    if (!Number.isFinite(value)) return undefined
    bytes[index] = value
  }
  return bytes
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function sha256Hex(
  value: ArrayBuffer | ArrayBufferView | string,
): Promise<string> {
  const bytes =
    typeof value === 'string'
      ? encoder.encode(value)
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  return bytesToHex(
    new Uint8Array(await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes))),
  )
}

export function ingressCanonicalRequest(headers: SignedIngressHeaders): string {
  return [
    'mailroom-ingress-v1',
    headers.timestamp,
    headers.idempotencyKey,
    headers.from.toLowerCase(),
    headers.to.toLowerCase(),
    headers.bodySha256.toLowerCase(),
  ].join('\n')
}

export function relayCanonicalRequest(headers: SignedRelayHeaders): string {
  return [
    'mailroom-relay-v1',
    headers.timestamp,
    headers.idempotencyKey,
    headers.method.toUpperCase(),
    headers.path,
    headers.bodySha256.toLowerCase(),
  ].join('\n')
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

export async function signIngressRequest(
  secret: string,
  headers: SignedIngressHeaders,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(ingressCanonicalRequest(headers)),
  )
  return bytesToHex(new Uint8Array(signature))
}

export async function signRelayRequest(
  secret: string,
  headers: SignedRelayHeaders,
): Promise<string> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await hmacKey(secret),
    encoder.encode(relayCanonicalRequest(headers)),
  )
  return bytesToHex(new Uint8Array(signature))
}

export async function verifyIngressRequest(
  secret: string,
  headers: SignedIngressHeaders,
  signatureHex: string,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<boolean> {
  const signature = hexToBytes(signatureHex)
  if (!signature) return false

  const timestamp = Number(headers.timestamp)
  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1_000
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 30_000 ||
    now - timestamp > maxAgeMs
  ) {
    return false
  }

  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    toArrayBuffer(signature),
    encoder.encode(ingressCanonicalRequest(headers)),
  )
}

export async function verifyRelayRequest(
  secret: string,
  headers: SignedRelayHeaders,
  signatureHex: string,
  options: { now?: number; maxAgeMs?: number } = {},
): Promise<boolean> {
  const signature = hexToBytes(signatureHex)
  if (!signature) return false

  const timestamp = Number(headers.timestamp)
  const now = options.now ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1_000
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now + 30_000 ||
    now - timestamp > maxAgeMs
  ) {
    return false
  }

  return crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    toArrayBuffer(signature),
    encoder.encode(relayCanonicalRequest(headers)),
  )
}

export async function verifyBearerToken(
  provided: string,
  expected: string,
): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    sha256Hex(provided),
    sha256Hex(expected),
  ])
  const providedBytes = hexToBytes(providedHash)
  const expectedBytes = hexToBytes(expectedHash)
  if (!providedBytes || !expectedBytes) return false

  const key = await hmacKey(expected)
  const probe = encoder.encode('mailroom-token-check')
  const expectedSignature = await crypto.subtle.sign('HMAC', key, probe)
  const providedKey = await hmacKey(provided)
  return crypto.subtle.verify('HMAC', providedKey, expectedSignature, probe)
}
