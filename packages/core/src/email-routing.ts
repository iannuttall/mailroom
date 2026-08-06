function normalizedHeader(headers: Headers, name: string): string {
  return headers.get(name)?.trim().toLowerCase() ?? ''
}

function hasAffirmativeHeader(headers: Headers, name: string): boolean {
  const value = normalizedHeader(headers, name)
  return value !== '' && value !== 'no' && value !== 'false' && value !== '0'
}

export function isAutomaticReply(headers: Headers): boolean {
  const autoSubmitted = normalizedHeader(headers, 'auto-submitted')

  if (autoSubmitted.includes('auto-replied')) return true
  if (hasAffirmativeHeader(headers, 'x-autoreply')) return true
  if (hasAffirmativeHeader(headers, 'x-autorespond')) return true

  if (!autoSubmitted.includes('auto-generated')) return false

  const exchangeSource = normalizedHeader(
    headers,
    'x-ms-exchange-generated-message-source',
  )
  return (
    exchangeSource.includes('mailbox rules agent') ||
    headers.has('x-ms-exchange-inbox-rules-loop')
  )
}

export function resolveForwardDestination(
  recipient: string,
  destinationsByDomain: string | undefined,
  fallback: string | undefined,
): string | undefined {
  const domain = recipientDomain(recipient)
  if (!domain || !destinationsByDomain?.trim()) return cleanAddress(fallback)

  try {
    const parsed: unknown = JSON.parse(destinationsByDomain)
    if (!isStringRecord(parsed)) {
      throw new Error('expected a JSON object of domain and destination pairs')
    }
    return cleanAddress(parsed[domain]) ?? cleanAddress(fallback)
  } catch (error) {
    console.error('mailroom_forwarding_config_invalid', {
      error: error instanceof Error ? error.message : String(error),
    })
    return cleanAddress(fallback)
  }
}

function recipientDomain(recipient: string): string | undefined {
  const at = recipient.lastIndexOf('@')
  if (at < 1 || at === recipient.length - 1) return undefined
  return (
    recipient
      .slice(at + 1)
      .trim()
      .toLowerCase() || undefined
  )
}

function cleanAddress(value: string | undefined): string | undefined {
  const address = value?.trim()
  return address || undefined
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every((entry) => typeof entry === 'string')
}
