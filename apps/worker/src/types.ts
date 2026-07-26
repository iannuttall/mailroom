import type { Context } from 'hono'

export type WorkerVariables = {
  requestId: string
}

export type WorkerApp = {
  Bindings: Env
  Variables: WorkerVariables
}

export type WorkerContext = Context<WorkerApp>

export type WaitUntilContext = {
  waitUntil(promise: Promise<unknown>): void
}

export type OperationContext = {
  env: Env
  executionCtx: WaitUntilContext
  requestId: string
}

export type JsonRecord = Record<string, unknown>
