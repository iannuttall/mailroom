import type { ApiResponse, OperationSummary } from '@mailroom/core'

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

export function printOperations(operations: OperationSummary[]): void {
  let current = ''
  for (const operation of operations) {
    if (operation.category !== current) {
      if (current) process.stdout.write('\n')
      current = operation.category
      process.stdout.write(`${current}\n`)
    }
    process.stdout.write(
      `  ${operation.id.padEnd(24)} ${operation.description}\n`,
    )
  }
}

export function printApiResult(result: ApiResponse): void {
  if (!result.ok) {
    process.stderr.write(`Error: ${result.error.message}\n`)
    return
  }
  if (
    result.data &&
    typeof result.data === 'object' &&
    'summary' in result.data &&
    typeof (result.data as { summary?: unknown }).summary === 'string'
  ) {
    process.stdout.write(`${(result.data as { summary: string }).summary}\n`)
  }
  printJson(result.data)
}
