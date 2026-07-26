import { defineCommand } from 'citty'
import { stringArg } from '../args.js'
import { createAuthenticatedClient } from '../config.js'
import { printApiResult, printJson } from '../output.js'

async function run(
  id: string,
  params: Record<string, unknown>,
  json: boolean,
): Promise<void> {
  const result = await (await createAuthenticatedClient()).runOperation(
    id,
    params,
  )
  if (json) printJson(result)
  else printApiResult(result)
}

export const statusCommand = defineCommand({
  meta: {
    name: 'status',
    description: 'Check Worker and storage status',
  },
  args: {
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => run('system.status', {}, args.json === true),
})

export const messagesCommand = defineCommand({
  meta: {
    name: 'messages',
    description: 'List recent message summaries',
  },
  args: {
    inbox: {
      type: 'string',
      description: 'Filter by inbox id.',
    },
    status: {
      type: 'string',
      description: 'Filter by unread, read, archived, or spam.',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of messages.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) =>
    run(
      'messages.list',
      Object.fromEntries(
        Object.entries({
          inboxId: stringArg(args.inbox),
          status: stringArg(args.status),
          limit: stringArg(args.limit),
        }).filter(([, value]) => value !== undefined),
      ),
      args.json === true,
    ),
})

export const readCommand = defineCommand({
  meta: {
    name: 'read',
    description: 'Read one message by id',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Message id.',
    },
    headers: {
      type: 'boolean',
      default: false,
      description: 'Include stored headers.',
    },
    attachments: {
      type: 'boolean',
      default: false,
      description: 'Include attachment metadata.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) =>
    run(
      'messages.get',
      {
        id: stringArg(args.id),
        includeBody: true,
        includeHeaders: args.headers === true,
        includeAttachments: args.attachments === true,
      },
      args.json === true,
    ),
})

export const searchCommand = defineCommand({
  meta: {
    name: 'search',
    description: 'Search message text and return compact matches',
  },
  args: {
    query: {
      type: 'positional',
      required: true,
      description: 'Search query.',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of results.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) =>
    run(
      'messages.search',
      Object.fromEntries(
        Object.entries({
          query: stringArg(args.query),
          limit: stringArg(args.limit),
        }).filter(([, value]) => value !== undefined),
      ),
      args.json === true,
    ),
})

export const draftsCommand = defineCommand({
  meta: {
    name: 'drafts',
    description: 'List drafts awaiting review',
  },
  args: {
    status: {
      type: 'string',
      description: 'Filter by draft status.',
    },
    limit: {
      type: 'string',
      description: 'Maximum number of drafts.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) =>
    run(
      'drafts.list',
      Object.fromEntries(
        Object.entries({
          status: stringArg(args.status),
          limit: stringArg(args.limit),
        }).filter(([, value]) => value !== undefined),
      ),
      args.json === true,
    ),
})
