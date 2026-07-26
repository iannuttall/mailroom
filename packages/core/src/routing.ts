import type { RouteRecord } from './schemas.js'

export type RouteMatch =
  | { matched: true; route: RouteRecord }
  | { matched: false; reason: 'invalid_recipient' | 'no_route' }

export function splitEmailAddress(
  address: string,
): { localPart: string; domain: string } | undefined {
  const separator = address.lastIndexOf('@')
  if (separator <= 0 || separator === address.length - 1) return undefined
  return {
    localPart: address.slice(0, separator).toLowerCase(),
    domain: address.slice(separator + 1).toLowerCase(),
  }
}

export function matchRoute(
  recipient: string,
  routes: readonly RouteRecord[],
): RouteMatch {
  const parsed = splitEmailAddress(recipient)
  if (!parsed) return { matched: false, reason: 'invalid_recipient' }

  const eligible = routes
    .filter((route) => route.enabled && route.domain === parsed.domain)
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'exact' ? -1 : 1
      return left.priority - right.priority
    })

  const exact = eligible.find(
    (route) => route.kind === 'exact' && route.localPart === parsed.localPart,
  )
  if (exact) return { matched: true, route: exact }

  const catchall = eligible.find((route) => route.kind === 'catchall')
  if (catchall) return { matched: true, route: catchall }

  return { matched: false, reason: 'no_route' }
}
