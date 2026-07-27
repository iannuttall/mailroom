import {
  describeOperation,
  listOperations,
  MAILROOM_OPERATION_CATEGORIES,
  MailroomError,
  type MailroomOperationCategory,
} from '@mailroom/core'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requestContext, requireApiToken } from './auth.js'
import { receiveGmailSentEmail } from './gmail-sent-ingress.js'
import { handleInboundEmail } from './inbound-handler.js'
import {
  consumeInboundQueue,
  sweepPendingInbound,
} from './inbound-processing.js'
import { executeOperation } from './operation-executor.js'
import { receiveRelayEmail } from './relay-ingress.js'
import { failure, success } from './responses.js'
import type { WorkerApp } from './types.js'

const app = new Hono<WorkerApp>()

app.use('*', requestContext)
app.get('/health', (context) =>
  context.json({
    ok: true,
    service: 'mailroom',
    time: new Date().toISOString(),
  }),
)

app.post('/v1/ingress', async (context) => {
  try {
    const result = await receiveRelayEmail(
      context.req.raw,
      context.env,
      context.executionCtx,
    )
    return success(context, result, result.duplicate ? 200 : 201)
  } catch (error) {
    return failure(context, error)
  }
})

app.post('/v1/ingress/gmail-sent', async (context) => {
  try {
    const result = await receiveGmailSentEmail(
      context.req.raw,
      context.env,
      context.executionCtx,
    )
    return success(context, result, result.duplicate ? 200 : 201)
  } catch (error) {
    return failure(context, error)
  }
})

app.use('/v1/*', requireApiToken)
app.use(
  '/v1/operations/*',
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: (context) =>
      context.json(
        {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'The request body is too large.',
          },
        },
        413,
      ),
  }),
)

app.get('/v1/operations', (context) => {
  try {
    const rawCategory = context.req.query('category')
    if (
      rawCategory &&
      !MAILROOM_OPERATION_CATEGORIES.includes(
        rawCategory as MailroomOperationCategory,
      )
    ) {
      throw new MailroomError(
        'INVALID_INPUT',
        `Unknown operation category: ${rawCategory}.`,
      )
    }
    return success(
      context,
      listOperations(rawCategory as MailroomOperationCategory | undefined),
    )
  } catch (error) {
    return failure(context, error)
  }
})

app.get('/v1/operations/:id', (context) => {
  try {
    return success(context, describeOperation(context.req.param('id')))
  } catch (error) {
    return failure(context, error)
  }
})

app.post('/v1/operations/:id', async (context) => {
  try {
    const payload = await context.req.json<{ params?: unknown }>()
    const data = await executeOperation(
      {
        env: context.env,
        executionCtx: context.executionCtx,
        requestId: context.get('requestId'),
      },
      context.req.param('id'),
      payload.params ?? {},
    )
    return success(context, data)
  } catch (error) {
    return failure(context, error)
  }
})

app.notFound((context) =>
  context.json(
    {
      ok: false,
      error: { code: 'NOT_FOUND', message: 'Route not found.' },
    },
    404,
  ),
)

app.onError((error, context) => failure(context, error))

export default {
  fetch: app.fetch,
  async email(
    message: ForwardableEmailMessage,
    env: Env,
    _executionCtx: ExecutionContext,
  ): Promise<void> {
    await handleInboundEmail(message, env)
  },
  async queue(
    batch: MessageBatch<unknown>,
    env: Env,
    executionCtx: ExecutionContext,
  ): Promise<void> {
    await consumeInboundQueue(batch, env, executionCtx)
  },
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    executionCtx: ExecutionContext,
  ): Promise<void> {
    executionCtx.waitUntil(sweepPendingInbound(env))
  },
} satisfies ExportedHandler<Env>
