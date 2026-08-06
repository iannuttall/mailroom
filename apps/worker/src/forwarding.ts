import { resolveForwardDestination } from '@mailroom/core'

type ForwardableMessage = Pick<ForwardableEmailMessage, 'to' | 'forward'>

export { resolveForwardDestination }

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
