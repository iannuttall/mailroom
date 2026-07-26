import { MailroomError } from './errors.js'
import { type ApiSuccess, apiResponseSchema } from './schemas.js'

export type MailroomClientOptions = {
  baseUrl: string
  token?: string
  fetch?: typeof globalThis.fetch
  maxResponseBytes?: number
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

async function readBoundedJson(
  response: Response,
  maxBytes: number,
): Promise<unknown> {
  const length = Number(response.headers.get('content-length'))
  if (Number.isFinite(length) && length > maxBytes) {
    throw new MailroomError(
      'REMOTE_ERROR',
      `Mailroom returned more than ${maxBytes} bytes.`,
    )
  }

  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > maxBytes) {
    throw new MailroomError(
      'REMOTE_ERROR',
      `Mailroom returned more than ${maxBytes} bytes.`,
    )
  }

  try {
    return JSON.parse(new TextDecoder().decode(buffer))
  } catch {
    throw new MailroomError(
      'REMOTE_ERROR',
      `Mailroom returned invalid JSON with status ${response.status}.`,
    )
  }
}

export class MailroomClient {
  readonly baseUrl: string
  readonly token?: string
  private readonly requestFetch: typeof globalThis.fetch
  private readonly maxResponseBytes: number

  constructor(options: MailroomClientOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl)
    this.token = options.token
    this.requestFetch = options.fetch ?? globalThis.fetch
    this.maxResponseBytes = options.maxResponseBytes ?? 2 * 1024 * 1024
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<ApiSuccess> {
    const headers = new Headers(init.headers)
    headers.set('accept', 'application/json')
    if (init.body) headers.set('content-type', 'application/json')
    if (this.token) headers.set('authorization', `Bearer ${this.token}`)

    let response: Response
    try {
      response = await this.requestFetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      })
    } catch (error) {
      throw new MailroomError(
        'REMOTE_ERROR',
        error instanceof Error
          ? `Could not reach Mailroom: ${error.message}`
          : 'Could not reach Mailroom.',
      )
    }

    const parsed = apiResponseSchema.safeParse(
      await readBoundedJson(response, this.maxResponseBytes),
    )
    if (!parsed.success) {
      throw new MailroomError(
        'REMOTE_ERROR',
        `Mailroom returned an invalid response with status ${response.status}.`,
      )
    }
    if (!parsed.data.ok) {
      throw new MailroomError(
        parsed.data.error.code,
        parsed.data.error.message,
        parsed.data.error.details,
      )
    }
    return parsed.data
  }

  async listOperations(category?: string): Promise<ApiSuccess> {
    const query = category ? `?category=${encodeURIComponent(category)}` : ''
    return this.request(`/v1/operations${query}`)
  }

  async describeOperation(id: string): Promise<ApiSuccess> {
    return this.request(`/v1/operations/${encodeURIComponent(id)}`)
  }

  async runOperation(
    id: string,
    params: Record<string, unknown> = {},
  ): Promise<ApiSuccess> {
    return this.request(`/v1/operations/${encodeURIComponent(id)}`, {
      method: 'POST',
      body: JSON.stringify({ params }),
    })
  }
}
