import { verifyBearerToken } from '@mailroom/core'
import { createMiddleware } from 'hono/factory'
import type { WorkerApp } from './types.js'

export const requestContext = createMiddleware<WorkerApp>(
  async (context, next) => {
    const requestId =
      context.req.header('cf-ray') ?? `req_${crypto.randomUUID()}`
    context.set('requestId', requestId)
    context.header('x-request-id', requestId)
    await next()
  },
)

export const requireApiToken = createMiddleware<WorkerApp>(
  async (context, next) => {
    const value = context.req.header('authorization')
    const token = value?.startsWith('Bearer ') ? value.slice(7) : ''
    if (
      !token ||
      !(await verifyBearerToken(token, context.env.MAILROOM_API_TOKEN))
    ) {
      return context.json(
        {
          ok: false,
          error: {
            code: 'AUTH_REQUIRED',
            message: 'A valid Mailroom API token is required.',
          },
        },
        401,
      )
    }
    await next()
  },
)
