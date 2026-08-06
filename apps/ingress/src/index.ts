import {
  isAutomaticReply,
  outboundMessageSchema,
  resolveForwardDestination,
  sha256Hex,
  signIngressRequest,
  verifyRelayRequest,
} from '@mailroom/core'

const jsonHeaders = { 'content-type': 'application/json' }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: jsonHeaders,
  })
}

export function allowedFromDomain(
  allowedDomains: string,
  address: string,
): boolean {
  const domain = address.toLowerCase().split('@').at(-1)
  return allowedDomains
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .includes(domain ?? '')
}

function emailBuilder(
  message: ReturnType<typeof outboundMessageSchema.parse>,
): EmailMessageBuilder {
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

async function send(request: Request, env: Env): Promise<Response> {
  const body = await request.arrayBuffer()
  if (!body.byteLength || body.byteLength > 1024 * 1024) {
    return json({ ok: false, error: { message: 'Invalid body size.' } }, 400)
  }
  const bodySha256 = request.headers.get('x-mailroom-body-sha256') ?? ''
  const signed = {
    timestamp: request.headers.get('x-mailroom-timestamp') ?? '',
    idempotencyKey: request.headers.get('x-mailroom-idempotency-key') ?? '',
    method: request.method,
    path: new URL(request.url).pathname,
    bodySha256,
  }
  const valid =
    bodySha256 === (await sha256Hex(body)) &&
    (await verifyRelayRequest(
      env.INGRESS_SECRET,
      signed,
      request.headers.get('x-mailroom-signature') ?? '',
    ))
  if (!valid) {
    return json({ ok: false, error: { message: 'Invalid signature.' } }, 403)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(new TextDecoder().decode(body))
  } catch {
    return json({ ok: false, error: { message: 'Invalid JSON.' } }, 400)
  }
  const message = outboundMessageSchema.safeParse(parsed)
  if (!message.success) {
    return json(
      {
        ok: false,
        error: {
          message: 'Invalid outbound message.',
          issues: message.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      400,
    )
  }
  if (!allowedFromDomain(env.ALLOWED_FROM_DOMAINS, message.data.from)) {
    return json(
      { ok: false, error: { message: 'The From domain is not allowed.' } },
      403,
    )
  }
  const result = await env.EMAIL.send(emailBuilder(message.data))
  return json({ ok: true, messageId: result.messageId })
}

export async function relayInbound(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<void> {
  const maxBytes = Number(env.MAX_EMAIL_BYTES)
  if (message.rawSize <= 0 || message.rawSize > maxBytes) {
    message.setReject('The email is too large for Mailroom.')
    return
  }
  const body = await new Response(message.raw).arrayBuffer()
  const centralUrl = new URL('/v1/ingress', env.CENTRAL_MAILROOM_URL)
  const idempotencyKey =
    message.headers.get('message-id') ?? `delivery_${crypto.randomUUID()}`
  const signed = {
    timestamp: String(Date.now()),
    idempotencyKey,
    from: message.from,
    to: message.to,
    bodySha256: await sha256Hex(body),
  }
  const signature = await signIngressRequest(env.INGRESS_SECRET, signed)
  const response = await fetch(centralUrl, {
    method: 'POST',
    headers: {
      'content-type': 'message/rfc822',
      'x-mailroom-timestamp': signed.timestamp,
      'x-mailroom-idempotency-key': idempotencyKey,
      'x-mailroom-from': message.from,
      'x-mailroom-to': message.to,
      'x-mailroom-body-sha256': signed.bodySha256,
      'x-mailroom-signature': signature,
    },
    body,
  })
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1_000)
    throw new Error(
      `Central Mailroom rejected the email (${response.status}): ${detail}`,
    )
  }

  if (isAutomaticReply(message.headers)) {
    console.log('mailroom_auto_reply_forward_suppressed', {
      recipient: message.to,
    })
    return
  }

  const forwardDestination = resolveForwardDestination(
    message.to,
    env.MAILROOM_FORWARD_TO_BY_DOMAIN,
    env.MAILROOM_FORWARD_TO,
  )
  if (forwardDestination) await message.forward(forwardDestination)
}

export default {
  fetch(request, env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Promise.resolve(json({ ok: true, service: 'mailroom-ingress' }))
    }
    if (request.method === 'POST' && url.pathname === '/v1/send') {
      return send(request, env)
    }
    return Promise.resolve(
      json({ ok: false, error: { message: 'Not found.' } }, 404),
    )
  },
  email: relayInbound,
} satisfies ExportedHandler<Env>
