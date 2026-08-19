import * as z from 'zod/v4'
import { MailroomError } from './errors.js'
import {
  domainNameSchema,
  draftStatusSchema,
  emailAddressSchema,
  idSchema,
  localPartSchema,
  messageStatusSchema,
  paginationSchema,
  routeKindSchema,
} from './schemas.js'

export const MAILROOM_OPERATION_CATEGORIES = [
  'system',
  'domains',
  'inboxes',
  'routes',
  'messages',
  'drafts',
  'automation',
] as const

export type MailroomOperationCategory =
  (typeof MAILROOM_OPERATION_CATEGORIES)[number]

type OperationSafety = {
  readOnly: boolean
  destructive: boolean
  idempotent: boolean
  requiresApproval: boolean
}

export type OperationSummary = {
  id: string
  category: MailroomOperationCategory
  name: string
  description: string
  safety: OperationSafety
}

export type OperationDefinition = OperationSummary & {
  useWhen: readonly string[]
  avoidWhen: readonly string[]
  outcome: string
  related: readonly string[]
  inputSchema: z.ZodObject
}

export type OperationDescription = Omit<OperationDefinition, 'inputSchema'> & {
  inputSchema: Record<string, unknown>
}

function operation(definition: OperationDefinition): OperationDefinition {
  return definition
}

const definitions: readonly OperationDefinition[] = [
  operation({
    id: 'system.status',
    category: 'system',
    name: 'System status',
    description: 'Check the Worker, storage bindings, and configured features',
    useWhen: ['Checking setup', 'Diagnosing a failed command'],
    avoidWhen: ['Reading mailbox content'],
    outcome:
      'Returns binding availability and service configuration without secrets.',
    related: ['domains.list', 'inboxes.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({}),
  }),
  operation({
    id: 'domains.list',
    category: 'domains',
    name: 'List domains',
    description: 'List email domains known to Mailroom',
    useWhen: ['Discovering configured domains', 'Finding a domain id'],
    avoidWhen: ['Changing domain settings'],
    outcome: 'Returns compact domain records and outbound relay state.',
    related: ['domains.upsert', 'inboxes.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: paginationSchema,
  }),
  operation({
    id: 'domains.upsert',
    category: 'domains',
    name: 'Add or update a domain',
    description: 'Create a domain or update its sending defaults',
    useWhen: ['Onboarding a domain', 'Changing From or Reply-To defaults'],
    avoidWhen: ['Creating Cloudflare DNS or Email Service records'],
    outcome: 'Returns the stored domain record.',
    related: ['domains.list', 'inboxes.upsert', 'routes.upsert'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      id: idSchema.optional(),
      domain: domainNameSchema,
      fromAddress: emailAddressSchema.optional(),
      replyTo: emailAddressSchema.optional(),
      relayUrl: z.url().max(2_048).nullable().optional(),
      enabled: z.boolean().default(true),
    }),
  }),
  operation({
    id: 'inboxes.list',
    category: 'inboxes',
    name: 'List inboxes',
    description: 'List logical inboxes, optionally for one domain',
    useWhen: ['Finding an inbox id', 'Reviewing mailbox coverage'],
    avoidWhen: ['Reading messages'],
    outcome: 'Returns compact inbox records.',
    related: ['inboxes.upsert', 'routes.list', 'messages.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: paginationSchema.extend({
      domain: domainNameSchema.optional(),
    }),
  }),
  operation({
    id: 'inboxes.upsert',
    category: 'inboxes',
    name: 'Add or update an inbox',
    description: 'Create a logical inbox or change its display settings',
    useWhen: ['Onboarding an address', 'Renaming or disabling an inbox'],
    avoidWhen: ['Creating the Cloudflare Email Routing rule'],
    outcome: 'Returns the stored inbox record.',
    related: ['inboxes.list', 'routes.upsert'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      id: idSchema.optional(),
      domain: domainNameSchema,
      localPart: localPartSchema,
      name: z.string().trim().min(1).max(120),
      enabled: z.boolean().default(true),
    }),
  }),
  operation({
    id: 'routes.list',
    category: 'routes',
    name: 'List routes',
    description: 'List exact and catch-all routes used during ingestion',
    useWhen: ['Checking where an address will be stored'],
    avoidWhen: ['Inspecting Cloudflare control-plane routing rules'],
    outcome: 'Returns ordered route records without message content.',
    related: ['routes.upsert', 'routes.delete', 'inboxes.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: paginationSchema.extend({
      domain: domainNameSchema.optional(),
      inboxId: idSchema.optional(),
    }),
  }),
  operation({
    id: 'routes.upsert',
    category: 'routes',
    name: 'Add or update a route',
    description: 'Map an exact address or explicit catch-all to an inbox',
    useWhen: ['Routing a new address', 'Changing route priority'],
    avoidWhen: ['A catch-all was not deliberately requested'],
    outcome: 'Returns the stored route.',
    related: ['routes.list', 'routes.delete'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z
      .object({
        id: idSchema.optional(),
        inboxId: idSchema,
        domain: domainNameSchema,
        kind: routeKindSchema.default('exact'),
        localPart: localPartSchema.nullable().optional(),
        enabled: z.boolean().default(true),
        priority: z.number().int().min(0).max(10_000).default(100),
      })
      .superRefine((value, context) => {
        if (value.kind === 'exact' && !value.localPart) {
          context.addIssue({
            code: 'custom',
            path: ['localPart'],
            message: 'An exact route needs a local part.',
          })
        }
        if (value.kind === 'catchall' && value.localPart) {
          context.addIssue({
            code: 'custom',
            path: ['localPart'],
            message: 'A catch-all route cannot have a local part.',
          })
        }
      }),
  }),
  operation({
    id: 'routes.delete',
    category: 'routes',
    name: 'Delete a route',
    description: 'Remove one Mailroom ingestion route',
    useWhen: ['An address should stop routing to an inbox'],
    avoidWhen: ['The route should only be disabled temporarily'],
    outcome: 'Returns the deleted route id.',
    related: ['routes.list', 'routes.upsert'],
    safety: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      requiresApproval: true,
    },
    inputSchema: z.object({ id: idSchema }),
  }),
  operation({
    id: 'messages.list',
    category: 'messages',
    name: 'List messages',
    description: 'List compact message summaries with bounded filters',
    useWhen: ['Checking recent mail', 'Finding a message id'],
    avoidWhen: ['Searching message text', 'Reading a full thread'],
    outcome: 'Returns summaries, a cursor, and no complete message bodies.',
    related: ['messages.get', 'messages.search', 'messages.thread'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: paginationSchema.extend({
      inboxId: idSchema.optional(),
      threadId: idSchema.optional(),
      status: messageStatusSchema.optional(),
      direction: z.enum(['inbound', 'outbound']).optional(),
      sender: emailAddressSchema.optional(),
      since: z.string().datetime().optional(),
      before: z.string().datetime().optional(),
    }),
  }),
  operation({
    id: 'messages.get',
    category: 'messages',
    name: 'Get a message',
    description:
      'Read one message with optional body, headers, and attachments',
    useWhen: ['A message id is already known'],
    avoidWhen: ['Finding messages', 'Reading every message in a thread'],
    outcome: 'Returns one message. Large or private fields are opt-in.',
    related: ['messages.list', 'messages.thread', 'drafts.create'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      id: idSchema,
      includeBody: z.boolean().default(true),
      includeHeaders: z.boolean().default(false),
      includeAttachments: z.boolean().default(false),
    }),
  }),
  operation({
    id: 'messages.thread',
    category: 'messages',
    name: 'Read a thread',
    description: 'Read bounded messages from one conversation',
    useWhen: ['Understanding the context before drafting or classifying'],
    avoidWhen: ['The thread id is not known'],
    outcome: 'Returns ordered messages with bodies only when requested.',
    related: ['messages.get', 'messages.search', 'drafts.create'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      threadId: idSchema,
      limit: z.coerce.number().int().min(1).max(50).default(20),
      includeBodies: z.boolean().default(false),
    }),
  }),
  operation({
    id: 'messages.search',
    category: 'messages',
    name: 'Search messages',
    description: 'Search message text with compact hybrid results',
    useWhen: ['Finding a topic', 'Looking for similar approved replies'],
    avoidWhen: ['A specific message id is already known'],
    outcome: 'Returns ranked snippets and identifiers, not full messages.',
    related: ['messages.get', 'messages.thread', 'messages.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      query: z.string().trim().min(2).max(1_000),
      inboxId: idSchema.optional(),
      direction: z.enum(['inbound', 'outbound']).optional(),
      status: messageStatusSchema.optional(),
      classification: z.string().trim().min(1).max(64).optional(),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }),
  }),
  operation({
    id: 'messages.update',
    category: 'messages',
    name: 'Update a message',
    description: 'Change read, archive, or spam state for one message',
    useWhen: [
      'Marking a reviewed message',
      'Moving spam out of normal results',
    ],
    avoidWhen: ['Changing message content'],
    outcome: 'Returns the updated message summary.',
    related: ['messages.get', 'messages.list'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      id: idSchema,
      status: messageStatusSchema,
    }),
  }),
  operation({
    id: 'drafts.list',
    category: 'drafts',
    name: 'List drafts',
    description: 'List compact pending and historical drafts',
    useWhen: ['Finding drafts that need approval'],
    avoidWhen: ['Reading the full draft body'],
    outcome: 'Returns draft summaries and approval state.',
    related: ['drafts.get', 'drafts.approve', 'drafts.reject'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: paginationSchema.extend({
      status: draftStatusSchema.optional(),
      threadId: idSchema.optional(),
    }),
  }),
  operation({
    id: 'drafts.get',
    category: 'drafts',
    name: 'Get a draft',
    description: 'Read one draft, its validation, and approval history',
    useWhen: ['Reviewing a draft before approval'],
    avoidWhen: ['Finding pending drafts'],
    outcome: 'Returns the complete draft and its audit metadata.',
    related: ['drafts.list', 'drafts.approve', 'drafts.reject'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({ id: idSchema }),
  }),
  operation({
    id: 'drafts.create',
    category: 'drafts',
    name: 'Create a draft',
    description: 'Prepare a reply without sending it',
    useWhen: ['A human or agent has enough thread context to propose a reply'],
    avoidWhen: ['The source message or recipient is unknown'],
    outcome: 'Stores a pending draft for review and later approval.',
    related: ['messages.thread', 'drafts.get', 'drafts.approve'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: false,
      requiresApproval: false,
    },
    inputSchema: z.object({
      messageId: idSchema,
      subject: z.string().trim().min(1).max(998).optional(),
      text: z.string().trim().min(1).max(250_000),
      html: z.string().trim().max(500_000).optional(),
      source: z.enum(['manual', 'automation', 'agent']).default('manual'),
      promptId: idSchema.optional(),
      promptHash: z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .optional(),
      model: z.string().trim().min(1).max(200).optional(),
    }),
  }),
  operation({
    id: 'drafts.approve',
    category: 'drafts',
    name: 'Approve a draft',
    description: 'Approve a validated draft for a later send',
    useWhen: ['The full draft and recipient have been reviewed'],
    avoidWhen: ['Validation has unresolved errors'],
    outcome: 'Records the approval. It does not send the email.',
    related: ['drafts.get', 'drafts.send', 'drafts.reject'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: true,
    },
    inputSchema: z.object({
      id: idSchema,
      approvedBy: z.string().trim().min(1).max(200),
      note: z.string().trim().max(2_000).optional(),
    }),
  }),
  operation({
    id: 'drafts.reject',
    category: 'drafts',
    name: 'Reject a draft',
    description: 'Reject a draft and record why',
    useWhen: ['A draft should not be sent'],
    avoidWhen: ['The draft only needs edits'],
    outcome: 'Records a rejection without deleting the audit trail.',
    related: ['drafts.get', 'drafts.create'],
    safety: {
      readOnly: false,
      destructive: false,
      idempotent: true,
      requiresApproval: true,
    },
    inputSchema: z.object({
      id: idSchema,
      rejectedBy: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(1).max(2_000),
    }),
  }),
  operation({
    id: 'drafts.send',
    category: 'drafts',
    name: 'Send an approved draft',
    description: 'Send one approved draft and record the delivery attempt',
    useWhen: ['The stored draft is approved and still matches the thread'],
    avoidWhen: ['The draft is pending, rejected, invalid, or already sent'],
    outcome:
      'Sends once using an idempotency key and returns the provider message id.',
    related: ['drafts.get', 'drafts.approve'],
    safety: {
      readOnly: false,
      destructive: true,
      idempotent: true,
      requiresApproval: true,
    },
    inputSchema: z.object({
      id: idSchema,
      idempotencyKey: z.string().trim().min(16).max(200),
    }),
  }),
  operation({
    id: 'automation.list',
    category: 'automation',
    name: 'List automations',
    description: 'List configured classification and drafting automations',
    useWhen: ['Discovering what can create drafts automatically'],
    avoidWhen: ['Reading prompt content'],
    outcome: 'Returns compact automation metadata and enabled state.',
    related: ['automation.test', 'prompts.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({}),
  }),
  operation({
    id: 'automation.test',
    category: 'automation',
    name: 'Test an automation',
    description: 'Evaluate one automation without storing or sending a draft',
    useWhen: ['Checking a rule or prompt against an existing message'],
    avoidWhen: ['A production draft should be created'],
    outcome: 'Returns matches, validation findings, and proposed next actions.',
    related: ['automation.list', 'messages.get', 'drafts.create'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      id: idSchema,
      messageId: idSchema,
      includePrompt: z.boolean().default(false),
    }),
  }),
  operation({
    id: 'prompts.list',
    category: 'automation',
    name: 'List prompts',
    description: 'List versioned prompt ids and purposes without prompt bodies',
    useWhen: ['Discovering available classification or drafting instructions'],
    avoidWhen: ['Reading a prompt body'],
    outcome: 'Returns prompt ids, kinds, and hashes.',
    related: ['prompts.get', 'automation.list'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({
      kind: z.enum(['shared', 'classify', 'draft', 'verify']).optional(),
    }),
  }),
  operation({
    id: 'prompts.get',
    category: 'automation',
    name: 'Get a prompt',
    description: 'Read one versioned Markdown prompt',
    useWhen: ['Inspecting the exact instructions before an automation runs'],
    avoidWhen: ['Only the available prompt ids are needed'],
    outcome: 'Returns one prompt body and its SHA-256 hash.',
    related: ['prompts.list', 'automation.test'],
    safety: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      requiresApproval: false,
    },
    inputSchema: z.object({ id: idSchema }),
  }),
]

const sortedDefinitions = [...definitions].sort((left, right) =>
  left.id.localeCompare(right.id),
)
const definitionsById = new Map(
  sortedDefinitions.map((definition) => [definition.id, definition]),
)

export function listOperations(
  category?: MailroomOperationCategory,
): OperationSummary[] {
  return sortedDefinitions
    .filter((definition) => !category || definition.category === category)
    .map(({ id, category: itemCategory, name, description, safety }) => ({
      id,
      category: itemCategory,
      name,
      description,
      safety,
    }))
}

export function getOperationDefinition(
  id: string,
): OperationDefinition | undefined {
  return definitionsById.get(id)
}

export function describeOperation(id: string): OperationDescription {
  const definition = getOperationDefinition(id)
  if (!definition) {
    throw new MailroomError('NOT_FOUND', `Unknown operation: ${id}.`)
  }
  const { inputSchema, ...summary } = definition
  return {
    ...summary,
    inputSchema: z.toJSONSchema(inputSchema) as Record<string, unknown>,
  }
}

export function parseOperationInput(
  id: string,
  input: unknown,
): Record<string, unknown> {
  const definition = getOperationDefinition(id)
  if (!definition) {
    throw new MailroomError('NOT_FOUND', `Unknown operation: ${id}.`)
  }
  const parsed = definition.inputSchema.safeParse(input)
  if (!parsed.success) {
    throw new MailroomError('INVALID_INPUT', 'Invalid operation parameters.', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return Object.fromEntries(Object.entries(parsed.data))
}
