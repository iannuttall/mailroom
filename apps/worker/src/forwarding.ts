type ForwardableMessage = Pick<ForwardableEmailMessage, 'to' | 'forward'>

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

export async function forwardStoredEmail(
  message: ForwardableMessage,
  destination: string | undefined,
  duplicate: boolean,
): Promise<boolean> {
  const address = destination?.trim()
  if (!address || duplicate) return false

  try {
    await message.forward(address)
    return true
  } catch (error) {
    console.error('mailroom_email_forward_failed', {
      recipient: message.to,
      destination: address,
      error: error instanceof Error ? error.message : String(error),
    })
    return false
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
