import type { ApiResponse } from '@mailroom/core'

export function apiToolResult(result: ApiResponse): {
  content: Array<{ type: 'text'; text: string }>
  structuredContent?: Record<string, unknown>
  isError?: boolean
} {
  if (!result.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: result.error.message }],
      structuredContent: { error: result.error },
    }
  }

  const data =
    result.data && typeof result.data === 'object'
      ? (result.data as Record<string, unknown>)
      : { value: result.data }

  return {
    content: [{ type: 'text', text: summaryText(data) }],
    structuredContent: { data, meta: result.meta },
  }
}

function summaryText(data: Record<string, unknown>): string {
  if (typeof data.summary === 'string') return data.summary
  if (Array.isArray(data.operations)) {
    return `${data.operations.length} Mailroom operations available.`
  }
  if (data.operation && typeof data.operation === 'object') {
    const id = (data.operation as { id?: unknown }).id
    if (typeof id === 'string') return `${id} operation described.`
  }
  return 'Mailroom operation completed.'
}

export function errorToolResult(error: unknown): {
  content: Array<{ type: 'text'; text: string }>
  structuredContent: Record<string, unknown>
  isError: true
} {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    structuredContent: { error: { message } },
  }
}
