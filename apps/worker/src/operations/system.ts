import { MAILROOM_VERSION } from '@mailroom/core'
import type { OperationContext } from '../types.js'

export async function systemStatus(
  context: OperationContext,
): Promise<unknown> {
  const database = await context.env.DB.prepare('SELECT 1 AS value').first<{
    value: number
  }>()
  return {
    service: 'mailroom',
    version: MAILROOM_VERSION,
    environment: context.env.ENVIRONMENT,
    requestId: context.requestId,
    bindings: {
      database: database?.value === 1,
      rawEmail: Boolean(context.env.RAW),
      ai: Boolean(context.env.AI),
      aiSearch: Boolean(context.env.AI_SEARCH),
      email: Boolean(context.env.EMAIL),
      telegram: Boolean(
        context.env.TELEGRAM_BOT_TOKEN && context.env.TELEGRAM_CHAT_ID,
      ),
    },
    automation: {
      model: context.env.AI_MODEL,
      automaticSending: false,
    },
  }
}
