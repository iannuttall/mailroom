import { MailroomError } from '@mailroom/core'
import * as z from 'zod/v4'
import {
  inputBoolean,
  inputString,
  optionalString,
} from '../operation-input.js'
import {
  getAutomationsConfig,
  getPrompt,
  listPrompts,
  type PromptKind,
} from '../prompts.js'
import type { OperationContext } from '../types.js'

type Input = Record<string, unknown>

const classificationSchema = z.object({
  classification: z.enum(['sponsorship', 'spam', 'other']),
  confidence: z.number().min(0).max(1),
  reason: z.string().trim().min(1).max(1_000),
  needsHuman: z.boolean(),
})

function responseText(response: unknown): string {
  if (
    response &&
    typeof response === 'object' &&
    'response' in response &&
    typeof response.response === 'string'
  ) {
    return response.response
  }
  throw new MailroomError(
    'REMOTE_ERROR',
    'Workers AI returned an unsupported response.',
  )
}

function parseModelJson(value: string): unknown {
  const trimmed = value
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new MailroomError(
      'REMOTE_ERROR',
      'Workers AI did not return valid JSON.',
    )
  }
}

export async function listAutomations(): Promise<unknown> {
  const config = getAutomationsConfig()
  return {
    items: config.automations.map((automation) => ({
      id: automation.id,
      enabled: automation.enabled,
      promptId: automation.prompt,
      classification: automation.classification,
      minConfidence: automation.minConfidence,
      action: automation.action,
      approval: automation.approval,
    })),
  }
}

export async function testAutomation(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const automation = getAutomationsConfig().automations.find(
    (candidate) => candidate.id === id,
  )
  if (!automation) {
    throw new MailroomError('NOT_FOUND', `Automation ${id} was not found.`)
  }
  const [prompt, safety, message] = await Promise.all([
    getPrompt(automation.prompt),
    getPrompt('shared/safety'),
    context.env.DB.prepare(
      `SELECT id, sender, recipients, subject, text_body, received_at
      FROM messages WHERE id = ?`,
    )
      .bind(inputString(input, 'messageId'))
      .first<Record<string, unknown>>(),
  ])
  if (!prompt || !safety) {
    throw new MailroomError(
      'INTERNAL_ERROR',
      'The automation prompt registry is incomplete.',
    )
  }
  if (!message) {
    throw new MailroomError('NOT_FOUND', 'The source message was not found.')
  }
  const response = await context.env.AI.run(context.env.AI_MODEL, {
    messages: [
      {
        role: 'system',
        content: `${safety.body}\n\n${prompt.body}`,
      },
      {
        role: 'user',
        content: [
          '<untrusted-email>',
          `From: ${String(message.sender)}`,
          `Subject: ${String(message.subject)}`,
          '',
          String(message.text_body ?? '').slice(0, 50_000),
          '</untrusted-email>',
        ].join('\n'),
      },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
    temperature: 0,
  })
  const classification = classificationSchema.parse(
    parseModelJson(responseText(response)),
  )
  const matched =
    classification.classification === automation.classification &&
    classification.confidence >= automation.minConfidence
  return {
    automation: {
      id: automation.id,
      enabled: automation.enabled,
      action: automation.action,
      approval: automation.approval,
    },
    messageId: message.id,
    matched,
    classification,
    proposedActions: matched
      ? ['create a pending draft', `request ${automation.approval} approval`]
      : [],
    stored: false,
    sent: false,
    model: context.env.AI_MODEL,
    prompt: {
      id: prompt.id,
      hash: prompt.hash,
      ...(inputBoolean(input, 'includePrompt') ? { body: prompt.body } : {}),
    },
  }
}

export async function promptsList(input: Input): Promise<unknown> {
  const kind = optionalString(input, 'kind') as PromptKind | undefined
  const prompts = await listPrompts(kind)
  return {
    items: prompts.map((prompt) => ({
      id: prompt.id,
      kind: prompt.kind,
      purpose: prompt.purpose,
      hash: prompt.hash,
    })),
  }
}

export async function promptGet(input: Input): Promise<unknown> {
  const id = inputString(input, 'id')
  const prompt = await getPrompt(id)
  if (!prompt)
    throw new MailroomError('NOT_FOUND', `Prompt ${id} was not found.`)
  return prompt
}
