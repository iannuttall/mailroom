import {
  describeOperation,
  listOperations,
  MAILROOM_OPERATION_CATEGORIES,
  MailroomError,
  type MailroomOperationCategory,
} from '@mailroom/core'
import { defineCommand } from 'citty'
import { jsonFlag, paramsArg, stringArg } from '../args.js'
import { createAuthenticatedClient } from '../config.js'
import { printApiResult, printJson, printOperations } from '../output.js'

function categoryArg(value: unknown): MailroomOperationCategory | undefined {
  const category = stringArg(value)
  if (!category) return undefined
  if (
    !MAILROOM_OPERATION_CATEGORIES.includes(
      category as MailroomOperationCategory,
    )
  ) {
    throw new MailroomError(
      'INVALID_INPUT',
      `Unknown operation category: ${category}.`,
    )
  }
  return category as MailroomOperationCategory
}

const listCommand = defineCommand({
  meta: {
    name: 'list',
    description:
      'List compact operation ids available to the CLI and MCP server',
  },
  args: {
    category: {
      type: 'string',
      description: 'Filter by operation category.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => {
    const operations = listOperations(categoryArg(args.category))
    if (jsonFlag(args)) {
      printJson({ operations, categories: MAILROOM_OPERATION_CATEGORIES })
      return
    }
    printOperations(operations)
    process.stdout.write(
      '\nUse `mailroom operations describe <id>` before running an unfamiliar operation.\n',
    )
  },
})

const describeCommand = defineCommand({
  meta: {
    name: 'describe',
    description: 'Show the schema and safety rules for one operation',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Operation id from `mailroom operations list`.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: ({ args }) => {
    const operation = describeOperation(stringArg(args.id) ?? '')
    if (jsonFlag(args)) {
      printJson({ operation })
      return
    }
    process.stdout.write(`${operation.name}\n${operation.description}\n\n`)
    process.stdout.write(`ID: ${operation.id}\n`)
    process.stdout.write(`Outcome: ${operation.outcome}\n`)
    process.stdout.write(
      `Safety: ${operation.safety.readOnly ? 'read only' : 'writes state'}, ${
        operation.safety.requiresApproval
          ? 'approval required'
          : 'no separate approval'
      }\n\n`,
    )
    process.stdout.write(`${JSON.stringify(operation.inputSchema, null, 2)}\n`)
  },
})

const runOperationCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'Run one operation with JSON parameters',
  },
  args: {
    id: {
      type: 'positional',
      required: true,
      description: 'Operation id from `mailroom operations list`.',
    },
    params: {
      type: 'string',
      description: 'Operation parameters as a JSON object.',
    },
    'params-file': {
      type: 'string',
      description: 'Read operation parameters from a JSON file.',
    },
    json: {
      type: 'boolean',
      default: false,
      description: 'Print machine-readable JSON.',
    },
  },
  run: async ({ args }) => {
    const id = stringArg(args.id) ?? ''
    const params = await paramsArg(args.params, args['params-file'])
    const result = await (await createAuthenticatedClient()).runOperation(
      id,
      params,
    )
    if (jsonFlag(args)) printJson(result)
    else printApiResult(result)
  },
})

export const operationsCommand = defineCommand({
  meta: {
    name: 'operations',
    description: 'Discover and run every Mailroom operation',
  },
  subCommands: {
    list: listCommand,
    describe: describeCommand,
    run: runOperationCommand,
  },
})

export { runOperationCommand }
