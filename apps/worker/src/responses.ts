import {
  applyOutputBudget,
  type MailroomError,
  mailroomErrorEnvelope,
  toMailroomError,
} from '@mailroom/core'
import type { WorkerContext } from './types.js'

const errorStatus: Record<
  MailroomError['code'],
  400 | 401 | 403 | 404 | 409 | 429 | 500 | 502
> = {
  AUTH_REQUIRED: 401,
  FORBIDDEN: 403,
  INVALID_INPUT: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  REMOTE_ERROR: 502,
  INTERNAL_ERROR: 500,
}

export function success(
  context: WorkerContext,
  data: unknown,
  status: 200 | 201 = 200,
  nextCursor?: string | null,
): Response {
  const output = applyOutputBudget(data)
  return context.json(
    {
      ok: true,
      data: output.value,
      meta: {
        requestId: context.get('requestId'),
        generatedAt: new Date().toISOString(),
        ...(nextCursor !== undefined ? { nextCursor } : {}),
        ...(output.budget.truncated ? { outputBudget: output.budget } : {}),
      },
    },
    status,
  )
}

export function failure(context: WorkerContext, error: unknown): Response {
  const normalized = toMailroomError(error)
  if (normalized.code === 'INTERNAL_ERROR') {
    console.error('mailroom_request_failed', {
      requestId: context.get('requestId'),
      error: normalized.message,
    })
  }
  return context.json(
    mailroomErrorEnvelope(normalized),
    errorStatus[normalized.code],
  )
}
