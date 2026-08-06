export async function notifyTelegram(
  env: Env,
  message: {
    id: string
    from: string
    to: string
    subject: string
    preview: string
  },
): Promise<void> {
  if (
    !env.TELEGRAM_BOT_TOKEN ||
    !env.TELEGRAM_CHAT_ID ||
    !telegramMailboxEnabled(message.to, env.TELEGRAM_NOTIFY_MAILBOXES)
  ) {
    return
  }

  const text = [
    'New Mailroom email',
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject || '(no subject)'}`,
    '',
    message.preview,
    '',
    `Message: ${message.id}`,
  ].join('\n')

  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        disable_web_page_preview: true,
      }),
    },
  )
  if (!response.ok) {
    console.error('mailroom_telegram_failed', {
      status: response.status,
      body: (await response.text()).slice(0, 500),
    })
  }
}

export function telegramMailboxEnabled(
  mailbox: string,
  configuredMailboxes: string | undefined,
): boolean {
  const target = mailbox.trim().toLowerCase()
  return telegramNotificationMailboxes(configuredMailboxes).includes(target)
}

export function telegramNotificationMailboxes(
  configuredMailboxes: string | undefined,
): string[] {
  if (!configuredMailboxes?.trim()) return []

  try {
    const parsed: unknown = JSON.parse(configuredMailboxes)
    if (
      !Array.isArray(parsed) ||
      !parsed.every((entry) => typeof entry === 'string')
    ) {
      throw new Error('expected a JSON array of mailbox addresses')
    }

    return parsed
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0)
  } catch (error) {
    console.error('mailroom_telegram_config_invalid', {
      error: error instanceof Error ? error.message : String(error),
    })
    return []
  }
}
