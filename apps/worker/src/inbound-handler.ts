import { forwardStoredEmail, resolveForwardDestination } from './forwarding.js'
import { archiveInboundEmail } from './inbound-archive.js'
import { enqueueInboundMarker } from './inbound-processing.js'

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const forwardDestination = resolveForwardDestination(
    message.to,
    env.MAILROOM_FORWARD_TO_BY_DOMAIN,
    env.MAILROOM_FORWARD_TO,
  )
  let markerKey: string
  try {
    ;({ markerKey } = await archiveInboundEmail(env, message))
  } catch (error) {
    await forwardStoredEmail(message, forwardDestination, false)
    console.error('mailroom_email_archive_failed', {
      recipient: message.to,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  await Promise.all([
    forwardStoredEmail(message, forwardDestination, false),
    enqueueInboundMarker(env, markerKey),
  ])
}
