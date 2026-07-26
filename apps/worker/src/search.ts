import { createMessageSearchDocument } from '@mailroom/core'

export type IndexableMessage = {
  id: string
  threadId: string
  inboxId: string
  mailbox: string
  direction: 'inbound' | 'outbound'
  from: string
  to: string[]
  cc: string[]
  subject: string
  text: string
  receivedAt: string
  status: string
  classification?: string | null
}

export async function indexMessage(
  env: Env,
  message: IndexableMessage,
): Promise<void> {
  const document = createMessageSearchDocument(message)
  try {
    await env.AI_SEARCH.items.upload(`messages/${message.id}.md`, document, {
      metadata: {
        messageId: message.id,
        threadId: message.threadId,
        inbox_id: message.inboxId,
        direction: message.direction,
        status: message.status,
        classification: message.classification ?? '',
        received_at: message.receivedAt,
      },
    })
    await env.DB.prepare(
      "UPDATE messages SET search_status = 'indexed' WHERE id = ?",
    )
      .bind(message.id)
      .run()
  } catch (error) {
    console.error('mailroom_search_index_failed', {
      messageId: message.id,
      error: error instanceof Error ? error.message : String(error),
    })
    await env.DB.prepare(
      "UPDATE messages SET search_status = 'failed' WHERE id = ?",
    )
      .bind(message.id)
      .run()
  }
}

export async function hybridSearch(
  env: Env,
  input: {
    query: string
    inboxId?: string
    direction?: string
    status?: string
    classification?: string
    limit: number
  },
): Promise<
  Array<{
    messageId: string
    score: number
    snippet: string
    metadata: Record<string, unknown>
  }>
> {
  const filters: Record<string, string> = {}
  if (input.inboxId) filters.inbox_id = input.inboxId
  if (input.direction) filters.direction = input.direction
  if (input.status) filters.status = input.status
  if (input.classification) filters.classification = input.classification

  const response = await env.AI_SEARCH.search({
    query: input.query,
    ai_search_options: {
      retrieval: {
        retrieval_type: 'hybrid',
        max_num_results: input.limit,
        return_on_failure: true,
        ...(Object.keys(filters).length ? { filters } : {}),
      },
    },
  })

  return response.chunks
    .map((chunk) => {
      const metadata = chunk.item.metadata ?? {}
      const messageId =
        typeof metadata.messageId === 'string'
          ? metadata.messageId
          : chunk.item.key.match(/messages\/(.+)\.md$/)?.[1]
      return messageId
        ? {
            messageId,
            score: chunk.score,
            snippet: chunk.text.slice(0, 800),
            metadata,
          }
        : null
    })
    .filter((result) => result !== null)
}
