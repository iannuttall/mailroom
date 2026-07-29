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
