import type { ApiSuccess } from '@mailroom/core'
import { expect, test } from 'vitest'
import { type MailroomApi, registerDiscoveryTools } from './discovery-tools.js'

type Handler = (input: Record<string, unknown>) => Promise<unknown>

function success(data: unknown): ApiSuccess {
  return {
    ok: true,
    data,
    meta: {
      requestId: 'test',
      generatedAt: '2026-07-26T12:00:00.000Z',
    },
  }
}

test('registers only list, describe, and run tools', () => {
  const names: string[] = []
  const server = {
    registerTool(name: string) {
      names.push(name)
    },
  }
  const client: MailroomApi = {
    runOperation: async () => success({}),
  }

  registerDiscoveryTools(server as never, client)
  expect(names).toEqual([
    'mailroom_list_operations',
    'mailroom_describe_operation',
    'mailroom_run_operation',
  ])
})

test('run forwards one operation id and bounded params', async () => {
  const handlers = new Map<string, Handler>()
  const server = {
    registerTool(name: string, _config: unknown, handler: Handler) {
      handlers.set(name, handler)
    },
  }
  let received: { id: string; params: Record<string, unknown> } | undefined
  const client: MailroomApi = {
    runOperation: async (id, params) => {
      received = { id, params: params ?? {} }
      return success({ summary: 'done' })
    },
  }

  registerDiscoveryTools(server as never, client)
  await handlers.get('mailroom_run_operation')?.({
    id: 'messages.list',
    params: { limit: 5 },
  })
  expect(received).toEqual({
    id: 'messages.list',
    params: { limit: 5 },
  })
})
