import { describe, expect, it } from 'vitest'
import { relaySecretForAddress } from './relay-secrets.js'

const env = (domainSecrets?: string) =>
  ({
    INGRESS_SECRET: 'shared-secret',
    INGRESS_SECRETS_BY_DOMAIN: domainSecrets,
  }) as Pick<Env, 'INGRESS_SECRET' | 'INGRESS_SECRETS_BY_DOMAIN'>

describe('relaySecretForAddress', () => {
  it('uses the shared secret when the domain has no override', () => {
    expect(relaySecretForAddress(env(), 'support@keep.md')).toBe(
      'shared-secret',
    )
  })

  it('uses a domain-specific secret for inbound and outbound addresses', () => {
    const secrets = JSON.stringify({
      'propertylicence.org.uk': 'property-licence-secret',
    })

    expect(
      relaySecretForAddress(env(secrets), 'support@PROPERTYLICENCE.ORG.UK'),
    ).toBe('property-licence-secret')
  })

  it('rejects an invalid secret map', () => {
    expect(() => relaySecretForAddress(env('[]'), 'support@keep.md')).toThrow(
      'must be a JSON object',
    )
  })

  it('rejects an invalid email address', () => {
    expect(() => relaySecretForAddress(env(), 'not-an-email')).toThrow(
      'email address is invalid',
    )
  })
})
