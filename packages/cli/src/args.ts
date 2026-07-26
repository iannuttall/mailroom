import { readFile } from 'node:fs/promises'
import { MailroomError } from '@mailroom/core'

export function stringArg(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function jsonFlag(args: Record<string, unknown>): boolean {
  return args.json === true
}

export async function paramsArg(
  inlineValue: unknown,
  fileValue: unknown,
): Promise<Record<string, unknown>> {
  const inline = stringArg(inlineValue)
  const file = stringArg(fileValue)
  if (inline && file) {
    throw new MailroomError(
      'INVALID_INPUT',
      'Use either --params or --params-file, not both.',
    )
  }
  if (!inline && !file) return {}

  const source = inline ?? (await readFile(file ?? '', 'utf8'))
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch {
    throw new MailroomError(
      'INVALID_INPUT',
      'Operation parameters must be valid JSON.',
    )
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new MailroomError(
      'INVALID_INPUT',
      'Operation parameters must be an object.',
    )
  }
  return Object.fromEntries(Object.entries(parsed))
}
