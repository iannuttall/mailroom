import { MailroomClient } from '@mailroom/core'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { type MailroomApi, registerDiscoveryTools } from './discovery-tools.js'

export { type MailroomApi, registerDiscoveryTools } from './discovery-tools.js'

export type CreateMcpServerOptions = {
  client?: MailroomApi
  baseUrl?: string
  token?: string
  version?: string
}

export function createMcpServer(
  options: CreateMcpServerOptions = {},
): McpServer {
  const client =
    options.client ??
    new MailroomClient({
      baseUrl:
        options.baseUrl ??
        process.env.MAILROOM_API_URL ??
        'http://127.0.0.1:8787',
      token: options.token ?? process.env.MAILROOM_API_TOKEN,
    })

  const server = new McpServer({
    name: 'mailroom',
    version: options.version ?? '0.1.1',
  })
  registerDiscoveryTools(server, client)
  return server
}

export async function startMcpServer(
  options: CreateMcpServerOptions & { test?: boolean } = {},
): Promise<void> {
  const server = createMcpServer(options)
  if (options.test) {
    process.stdout.write('Mailroom MCP server constructed successfully.\n')
    return
  }
  await server.connect(new StdioServerTransport())
}
