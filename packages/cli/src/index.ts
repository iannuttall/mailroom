import {
  MAILROOM_VERSION,
  mailroomErrorEnvelope,
  toMailroomError,
} from '@mailroom/core'
import { defineCommand, runCommand, runMain } from 'citty'
import { authCommand } from './commands/auth.js'
import { mcpCommand } from './commands/mcp.js'
import {
  operationsCommand,
  runOperationCommand,
} from './commands/operations.js'
import {
  draftsCommand,
  messagesCommand,
  readCommand,
  searchCommand,
  statusCommand,
} from './commands/shortcuts.js'

const help = `mailroom v${MAILROOM_VERSION}
Read and reply to project email from your terminal or agent.

Start here
  mailroom auth login       Connect to your Worker
  mailroom status           Check Worker and storage status
  mailroom messages         List recent messages
  mailroom read <id>        Read one message
  mailroom search <query>   Search message text
  mailroom drafts           List drafts awaiting review

Agent tools
  mailroom operations list          Discover every operation
  mailroom operations describe <id> Inspect one schema and its safety rules
  mailroom operations run <id>      Run one operation
  mailroom mcp config               Print MCP client configuration
  mailroom mcp serve                Start the stdio MCP server

Use \`mailroom <command> --help\` for command options.
`

const main = defineCommand({
  meta: {
    name: 'mailroom',
    version: MAILROOM_VERSION,
    description: 'Private email infrastructure for people and AI agents',
  },
  subCommands: {
    auth: authCommand,
    status: statusCommand,
    messages: messagesCommand,
    read: readCommand,
    search: searchCommand,
    drafts: draftsCommand,
    operations: operationsCommand,
    run: runOperationCommand,
    mcp: mcpCommand,
  },
  run: () => {
    process.stdout.write(help)
  },
})

const argv = process.argv.slice(2)
if (argv.length === 1 && ['--version', '-v'].includes(argv[0] ?? '')) {
  process.stdout.write(`${MAILROOM_VERSION}\n`)
  process.exit(0)
}
if (
  argv.length === 0 ||
  (argv.length === 1 && ['help', '--help', '-h'].includes(argv[0] ?? ''))
) {
  process.stdout.write(help)
  process.exit(0)
}

const commandArgs =
  argv[0] === 'help' && argv.length > 1 ? [...argv.slice(1), '--help'] : argv
if (commandArgs !== argv) {
  process.argv = [
    process.argv[0] ?? 'node',
    process.argv[1] ?? 'mailroom',
    ...commandArgs,
  ]
}

try {
  if (commandArgs.some((arg) => ['--help', '-h'].includes(arg))) {
    await runMain(main)
  } else {
    await runCommand(main, { rawArgs: commandArgs })
  }
} catch (error) {
  const normalized = toMailroomError(error)
  if (argv.includes('--json')) {
    process.stdout.write(
      `${JSON.stringify(mailroomErrorEnvelope(normalized), null, 2)}\n`,
    )
  } else {
    process.stderr.write(`Error: ${normalized.message}\n`)
  }
  process.exitCode = normalized.exitCode
}
