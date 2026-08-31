import { splitEmailAddress } from '@mailroom/core'

type RelaySecretEnv = Pick<Env, 'INGRESS_SECRET' | 'INGRESS_SECRETS_BY_DOMAIN'>

function secretMap(value: string | undefined): Record<string, string> {
  if (!value) return {}

  const parsed: unknown = JSON.parse(value)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('INGRESS_SECRETS_BY_DOMAIN must be a JSON object.')
  }

  return Object.fromEntries(
    Object.entries(parsed).flatMap(([domain, secret]) => {
      if (typeof secret !== 'string' || !secret.trim()) return []
      return [[domain.trim().toLowerCase(), secret]]
    }),
  )
}

export function relaySecretForAddress(
  env: RelaySecretEnv,
  address: string,
): string {
  const domain = splitEmailAddress(address)?.domain
  if (!domain) throw new Error('The relay email address is invalid.')
  return secretMap(env.INGRESS_SECRETS_BY_DOMAIN)[domain] ?? env.INGRESS_SECRET
}
