import { isAutomaticReply } from './automatic-replies.js'
import { forwardStoredEmail, resolveForwardDestination } from './forwarding.js'
import { archiveInboundEmail } from './inbound-archive.js'
import { enqueueInboundMarker } from './inbound-processing.js'

export async function handleInboundEmail(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const suppressForwarding = isAutomaticReply(message.headers)
  const forwardDestination = suppressForwarding
    ? undefined
    : resolveForwardDestination(
        message.to,
        env.MAILROOM_FORWARD_TO_BY_DOMAIN,
        env.MAILROOM_FORWARD_TO,
      )
  let markerKey: string
  try {
    ;({ markerKey } = await archiveInboundEmail(env, message))
  } catch (error) {
    if (!suppressForwarding) {
      await forwardStoredEmail(message, forwardDestination, false)
    }
    console.error('mailroom_email_archive_failed', {
      recipient: message.to,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }

  if (suppressForwarding) {
    console.log('mailroom_auto_reply_forward_suppressed', {
      recipient: message.to,
    })
  }

  await Promise.all([
    suppressForwarding
      ? Promise.resolve(false)
      : forwardStoredEmail(message, forwardDestination, false),
    enqueueInboundMarker(env, markerKey),
  ])
}
