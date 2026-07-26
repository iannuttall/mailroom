import { MailroomError } from '@mailroom/core'

export function inputString(
  input: Record<string, unknown>,
  key: string,
): string {
  const value = input[key]
  if (typeof value !== 'string') {
    throw new MailroomError('INVALID_INPUT', `${key} must be a string.`)
  }
  return value
}

export function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key]
  return typeof value === 'string' ? value : undefined
}

export function inputBoolean(
  input: Record<string, unknown>,
  key: string,
): boolean {
  return input[key] === true
}

export function inputNumber(
  input: Record<string, unknown>,
  key: string,
): number {
  const value = input[key]
  if (typeof value !== 'number') {
    throw new MailroomError('INVALID_INPUT', `${key} must be a number.`)
  }
  return value
}

export function inputStrings(
  input: Record<string, unknown>,
  key: string,
): string[] {
  const value = input[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}
