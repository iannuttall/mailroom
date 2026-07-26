export const AGENT_OUTPUT_MAX_BYTES = 96 * 1024

export type OutputOmission = {
  path: string
  kind: 'array' | 'string' | 'field'
  available?: number
  returned?: number
}

type CompactOptions = {
  arrayLimit: number
  stringLimit: number
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function compactValue(
  value: unknown,
  path: string,
  options: CompactOptions,
  omissions: OutputOmission[],
): unknown {
  if (typeof value === 'string') {
    if (value.length <= options.stringLimit) return value
    omissions.push({
      path,
      kind: 'string',
      available: value.length,
      returned: options.stringLimit,
    })
    return `${value.slice(0, Math.max(1, options.stringLimit - 3)).trimEnd()}...`
  }
  if (Array.isArray(value)) {
    if (value.length > options.arrayLimit) {
      omissions.push({
        path,
        kind: 'array',
        available: value.length,
        returned: options.arrayLimit,
      })
    }
    return value
      .slice(0, options.arrayLimit)
      .map((item, index) =>
        compactValue(item, `${path}[${index}]`, options, omissions),
      )
  }
  if (!value || typeof value !== 'object') return value

  const compact: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    const itemPath = path ? `${path}.${key}` : key
    compact[key] = compactValue(item, itemPath, options, omissions)
  }
  return compact
}

export function applyOutputBudget(
  value: unknown,
  maxBytes = AGENT_OUTPUT_MAX_BYTES,
): {
  value: unknown
  budget: {
    maxBytes: number
    originalBytes: number
    returnedBytes: number
    truncated: boolean
    omissions: OutputOmission[]
  }
} {
  const originalBytes = jsonBytes(value)
  if (originalBytes <= maxBytes) {
    return {
      value,
      budget: {
        maxBytes,
        originalBytes,
        returnedBytes: originalBytes,
        truncated: false,
        omissions: [],
      },
    }
  }

  const attempts: CompactOptions[] = [
    { arrayLimit: 25, stringLimit: 8_000 },
    { arrayLimit: 10, stringLimit: 4_000 },
    { arrayLimit: 5, stringLimit: 2_000 },
    { arrayLimit: 2, stringLimit: 1_000 },
  ]

  for (const options of attempts) {
    const omissions: OutputOmission[] = []
    const compact = compactValue(value, '', options, omissions)
    const returnedBytes = jsonBytes(compact)
    if (returnedBytes <= maxBytes) {
      return {
        value: compact,
        budget: {
          maxBytes,
          originalBytes,
          returnedBytes,
          truncated: true,
          omissions: omissions.slice(0, 100),
        },
      }
    }
  }

  const fallback = {
    detail:
      'The result exceeded the agent output budget. Narrow the query or request one record.',
  }
  return {
    value: fallback,
    budget: {
      maxBytes,
      originalBytes,
      returnedBytes: jsonBytes(fallback),
      truncated: true,
      omissions: [{ path: '', kind: 'field' }],
    },
  }
}
