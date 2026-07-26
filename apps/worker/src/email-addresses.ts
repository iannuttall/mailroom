import type { Address, Mailbox } from 'postal-mime'

function mailboxes(addresses: Address[] | undefined): Mailbox[] {
  return (addresses ?? []).flatMap((address) =>
    address.address ? [address as Mailbox] : (address.group ?? []),
  )
}

export function emailAddresses(addresses: Address[] | undefined): string[] {
  return mailboxes(addresses)
    .map((mailbox) => mailbox.address.trim().toLowerCase())
    .filter(Boolean)
}

export function firstEmailAddress(address: Address | undefined): string {
  if (!address) return ''
  if (!address.address) {
    return address.group?.[0]?.address.trim().toLowerCase() ?? ''
  }
  return address.address.trim().toLowerCase()
}

export function addressName(address: Address | undefined): string | null {
  if (!address) return null
  if (!address.address) return address.group?.[0]?.name.trim() || null
  return address.name.trim() || null
}
