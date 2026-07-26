import { sha256Hex, signRelayRequest } from '@mailroom/core'

export type OutboundMessage = {
  from: string
  to: string
  replyTo?: string | null
  subject: string
  text: string
  html?: string | null
  inReplyTo?: string | null
  references?: string[]
}

function emailBuilder(message: OutboundMessage): EmailMessageBuilder {
  const headers: Record<string, string> = {}
  if (message.inReplyTo) headers['In-Reply-To'] = message.inReplyTo
  if (message.references?.length) {
    headers.References = message.references.join(' ')
  }
  return {
    from: message.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.replyTo ? { replyTo: message.replyTo } : {}),
    ...(message.html ? { html: message.html } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
  }
}

async function sendThroughRelay(
  env: Env,
  relayUrl: string,
  message: OutboundMessage,
  idempotencyKey: string,
): Promise<EmailSendResult> {
  const url = new URL('/v1/send', relayUrl)
  const body = JSON.stringify(message)
  const signed = {
    timestamp: String(Date.now()),
    idempotencyKey,
    method: 'POST',
    path: url.pathname,
    bodySha256: await sha256Hex(body),
  }
  const signature = await signRelayRequest(env.INGRESS_SECRET, signed)
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mailroom-timestamp': signed.timestamp,
      'x-mailroom-idempotency-key': idempotencyKey,
      'x-mailroom-body-sha256': signed.bodySha256,
      'x-mailroom-signature': signature,
    },
    body,
  })
  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean
    messageId?: string
    error?: { message?: string }
  } | null
  if (!response.ok || !payload?.ok || !payload.messageId) {
    throw new Error(
      payload?.error?.message ??
        `The outbound relay returned HTTP ${response.status}.`,
    )
  }
  return { messageId: payload.messageId }
}

export function sendOutbound(
  env: Env,
  message: OutboundMessage,
  relayUrl: string | null,
  idempotencyKey: string,
): Promise<EmailSendResult> {
  return relayUrl
    ? sendThroughRelay(env, relayUrl, message, idempotencyKey)
    : env.EMAIL.send(emailBuilder(message))
}
