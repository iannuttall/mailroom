export const MAILROOM_ERROR_CODES = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'INVALID_INPUT',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'REMOTE_ERROR',
  'INTERNAL_ERROR',
] as const

export type MailroomErrorCode = (typeof MAILROOM_ERROR_CODES)[number]

const exitCodes: Record<MailroomErrorCode, number> = {
  AUTH_REQUIRED: 3,
  FORBIDDEN: 4,
  INVALID_INPUT: 2,
  NOT_FOUND: 5,
  CONFLICT: 6,
  RATE_LIMITED: 7,
  REMOTE_ERROR: 8,
  INTERNAL_ERROR: 1,
}

export class MailroomError extends Error {
  readonly code: MailroomErrorCode
  readonly details?: Record<string, unknown>
  readonly exitCode: number

  constructor(
    code: MailroomErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'MailroomError'
    this.code = code
    this.details = details
    this.exitCode = exitCodes[code]
  }
}

export function toMailroomError(error: unknown): MailroomError {
  if (error instanceof MailroomError) return error
  if (error instanceof Error) {
    return new MailroomError('INTERNAL_ERROR', error.message)
  }
  return new MailroomError('INTERNAL_ERROR', 'An unknown error occurred.')
}

export function mailroomErrorEnvelope(error: unknown): {
  ok: false
  error: {
    code: MailroomErrorCode
    message: string
    details?: Record<string, unknown>
  }
} {
  const normalized = toMailroomError(error)
  return {
    ok: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      ...(normalized.details ? { details: normalized.details } : {}),
    },
  }
}
