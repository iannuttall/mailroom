const replyPrefixes = /^(?:(?:re|fw|fwd)\s*:\s*)+/i
const whitespace = /\s+/g

export function normalizeSubject(subject: string | undefined): string {
  return (subject ?? '')
    .replace(replyPrefixes, '')
    .replace(whitespace, ' ')
    .trim()
    .toLowerCase()
}

export function normalizeMessageId(value: string | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.startsWith('<') && trimmed.endsWith('>')
    ? trimmed
    : `<${trimmed.replaceAll(/[<>]/g, '')}>`
}

export function messageIdReferences(
  inReplyTo: string | undefined,
  references: string | undefined,
): string[] {
  const found = new Set<string>()
  const source = `${inReplyTo ?? ''} ${references ?? ''}`
  for (const match of source.matchAll(/<[^<>\s]+>/g)) {
    const value = normalizeMessageId(match[0])
    if (value) found.add(value)
  }
  return [...found]
}

export function plainTextPreview(
  value: string | undefined,
  limit = 240,
): string {
  const normalized = (value ?? '').replace(whitespace, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, Math.max(1, limit - 3)).trimEnd()}...`
}

export function headersToRecord(
  headers: Headers,
  options: { maxHeaders?: number; maxValueLength?: number } = {},
): Record<string, string[]> {
  const maxHeaders = options.maxHeaders ?? 200
  const maxValueLength = options.maxValueLength ?? 8_192
  const record: Record<string, string[]> = {}
  let count = 0

  for (const [rawName, rawValue] of headers.entries()) {
    if (count >= maxHeaders) break
    const name = rawName.toLowerCase()
    const value = rawValue.slice(0, maxValueLength)
    record[name] = [...(record[name] ?? []), value]
    count += 1
  }

  return record
}

export type SearchDocumentMessage = {
  id: string
  threadId: string
  direction: 'inbound' | 'outbound'
  mailbox: string
  from: string
  to: readonly string[]
  cc?: readonly string[]
  subject: string
  text: string
  receivedAt: string
  status: string
  classification?: string | null
}

function markdownValue(value: string): string {
  return value.replaceAll('\r', '').trim()
}

export function createMessageSearchDocument(
  message: SearchDocumentMessage,
): string {
  const fields = [
    `# ${markdownValue(message.subject) || '(no subject)'}`,
    '',
    `- Message: ${message.id}`,
    `- Thread: ${message.threadId}`,
    `- Mailbox: ${message.mailbox}`,
    `- Direction: ${message.direction}`,
    `- From: ${message.from}`,
    `- To: ${message.to.join(', ')}`,
    ...(message.cc?.length ? [`- Cc: ${message.cc.join(', ')}`] : []),
    `- Received: ${message.receivedAt}`,
    `- Status: ${message.status}`,
    ...(message.classification
      ? [`- Classification: ${message.classification}`]
      : []),
    '',
    '## Message',
    '',
    markdownValue(message.text),
    '',
  ]
  return fields.join('\n')
}
