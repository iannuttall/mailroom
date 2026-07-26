import { startMcpServer } from '@mailroom/mcp'
import { defineCommand } from 'citty'
import { resolveCredentials } from '../config.js'
import { printJson } from '../output.js'

const serveCommand = defineCommand({
  meta: {
    name: 'serve',
    description: 'Start the local stdio MCP server',
  },
  args: {
    test: {
      type: 'boolean',
      default: false,
      description: 'Construct the server and exit.',
    },
  },
  run: async ({ args }) => {
    const credentials = await resolveCredentials()
    await startMcpServer({
      baseUrl: credentials.apiUrl,
      token: credentials.token,
      test: args.test === true,
    })
  },
})

const configCommand = defineCommand({
  meta: {
    name: 'config',
    description: 'Print an MCP client configuration',
  },
  run: () => {
    printJson({
      mcpServers: {
        mailroom: {
          command: 'mailroom',
          args: ['mcp', 'serve'],
        },
      },
    })
  },
})

export const mcpCommand = defineCommand({
  meta: {
    name: 'mcp',
    description: 'Run or configure the stdio MCP server',
  },
  subCommands: {
    serve: serveCommand,
    config: configCommand,
  },
})
