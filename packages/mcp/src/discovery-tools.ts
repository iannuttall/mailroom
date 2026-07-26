import {
  describeOperation,
  listOperations,
  MAILROOM_OPERATION_CATEGORIES,
  type MailroomClient,
} from '@mailroom/core'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import * as z from 'zod/v4'
import { apiToolResult, errorToolResult } from './tool-result.js'

const openOutputSchema = z.looseObject({})

export type MailroomApi = Pick<MailroomClient, 'runOperation'>

export function registerDiscoveryTools(
  server: Pick<McpServer, 'registerTool'>,
  client: MailroomApi,
): void {
  server.registerTool(
    'mailroom_list_operations',
    {
      description:
        'List compact Mailroom operation ids and purposes, optionally by category',
      inputSchema: {
        category: z.enum(MAILROOM_OPERATION_CATEGORIES).optional(),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ category }) => {
      try {
        return apiToolResult({
          ok: true,
          data: {
            operations: listOperations(category),
            categories: MAILROOM_OPERATION_CATEGORIES,
          },
          meta: {
            requestId: crypto.randomUUID(),
            generatedAt: new Date().toISOString(),
          },
        })
      } catch (error) {
        return errorToolResult(error)
      }
    },
  )

  server.registerTool(
    'mailroom_describe_operation',
    {
      description:
        'Describe one Mailroom operation, including its parameters, safety rules, and related operations',
      inputSchema: {
        id: z.string().trim().min(1).max(128),
      },
      outputSchema: openOutputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ id }) => {
      try {
        return apiToolResult({
          ok: true,
          data: { operation: describeOperation(id) },
          meta: {
            requestId: crypto.randomUUID(),
            generatedAt: new Date().toISOString(),
          },
        })
      } catch (error) {
        return errorToolResult(error)
      }
    },
  )

  server.registerTool(
    'mailroom_run_operation',
    {
      description:
        'Run one Mailroom operation by id with parameters from mailroom_describe_operation',
      inputSchema: {
        id: z.string().trim().min(1).max(128),
        params: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: openOutputSchema,
      annotations: {
        destructiveHint: true,
      },
    },
    async ({ id, params }) => {
      try {
        return apiToolResult(await client.runOperation(id, params ?? {}))
      } catch (error) {
        return errorToolResult(error)
      }
    },
  )
}
