import assert from 'node:assert/strict'
import test from 'node:test'
import {
  relayCanonicalRequest,
  sha256Hex,
  signIngressRequest,
  signRelayRequest,
  verifyBearerToken,
  verifyIngressRequest,
  verifyRelayRequest,
} from './crypto.js'

test('signed ingress requests reject tampering and stale timestamps', async () => {
  const now = Date.now()
  const headers = {
    timestamp: String(now),
    idempotencyKey: 'test-test-test-test',
    from: 'sender@example.com',
    to: 'ian@example.net',
    bodySha256: await sha256Hex('hello'),
  }
  const signature = await signIngressRequest('test-secret', headers)

  assert.equal(
    await verifyIngressRequest('test-secret', headers, signature, { now }),
    true,
  )
  assert.equal(
    await verifyIngressRequest(
      'test-secret',
      { ...headers, to: 'attacker@example.net' },
      signature,
      { now },
    ),
    false,
  )
  assert.equal(
    await verifyIngressRequest('test-secret', headers, signature, {
      now: now + 6 * 60 * 1_000,
    }),
    false,
  )
})

test('bearer token verification does not accept a different token', async () => {
  assert.equal(await verifyBearerToken('correct', 'correct'), true)
  assert.equal(await verifyBearerToken('incorrect', 'correct'), false)
})

test('relay signatures bind the request body and route', async () => {
  const headers = {
    timestamp: '1700000000000',
    idempotencyKey: 'test-test-test-test',
    method: 'POST',
    path: '/v1/send',
    bodySha256: await sha256Hex('{"hello":"world"}'),
  }
  const signature = await signRelayRequest('secret', headers)
  assert.equal(
    relayCanonicalRequest(headers).startsWith('mailroom-relay-v1\n'),
    true,
  )
  assert.equal(
    await verifyRelayRequest('secret', headers, signature, {
      now: 1700000000000,
    }),
    true,
  )
  assert.equal(
    await verifyRelayRequest(
      'secret',
      { ...headers, path: '/v1/other' },
      signature,
      { now: 1700000000000 },
    ),
    false,
  )
})
