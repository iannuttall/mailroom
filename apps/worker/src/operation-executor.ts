import { MailroomError, parseOperationInput } from '@mailroom/core'
import {
  listAutomations,
  promptGet,
  promptsList,
  testAutomation,
} from './operations/automation.js'
import {
  approveDraft,
  createDraft,
  getDraft,
  listDrafts,
  rejectDraft,
  sendDraft,
} from './operations/drafts.js'
import {
  getMessage,
  getThread,
  listMessages,
  searchMessages,
  updateMessage,
} from './operations/messages.js'
import {
  deleteRoute,
  listDomains,
  listInboxes,
  listRoutes,
  upsertDomain,
  upsertInbox,
  upsertRoute,
} from './operations/setup.js'
import { systemStatus } from './operations/system.js'
import type { OperationContext } from './types.js'

type Handler = (
  context: OperationContext,
  input: Record<string, unknown>,
) => Promise<unknown>

const handlers: Record<string, Handler> = {
  'system.status': systemStatus,
  'domains.list': listDomains,
  'domains.upsert': upsertDomain,
  'inboxes.list': listInboxes,
  'inboxes.upsert': upsertInbox,
  'routes.list': listRoutes,
  'routes.upsert': upsertRoute,
  'routes.delete': deleteRoute,
  'messages.list': listMessages,
  'messages.get': getMessage,
  'messages.thread': getThread,
  'messages.search': searchMessages,
  'messages.update': updateMessage,
  'drafts.list': listDrafts,
  'drafts.get': getDraft,
  'drafts.create': createDraft,
  'drafts.approve': approveDraft,
  'drafts.reject': rejectDraft,
  'drafts.send': sendDraft,
  'automation.list': (_context) => listAutomations(),
  'automation.test': testAutomation,
  'prompts.list': (_context, input) => promptsList(input),
  'prompts.get': (_context, input) => promptGet(input),
}

export async function executeOperation(
  context: OperationContext,
  id: string,
  rawInput: unknown,
): Promise<unknown> {
  const input = parseOperationInput(id, rawInput)
  const handler = handlers[id]
  if (!handler) {
    throw new MailroomError(
      'INTERNAL_ERROR',
      `Operation ${id} has no Worker implementation.`,
    )
  }
  return handler(context, input)
}

export function missingOperationHandlers(operationIds: string[]): string[] {
  return operationIds.filter((id) => !handlers[id])
}
