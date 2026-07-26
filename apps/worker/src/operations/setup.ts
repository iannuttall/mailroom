import { MailroomError } from '@mailroom/core'
import { asBoolean, cursorFor, cursorFrom, newId, nowIso } from '../database.js'
import {
  inputBoolean,
  inputNumber,
  inputString,
  optionalString,
} from '../operation-input.js'
import type { OperationContext } from '../types.js'

type Input = Record<string, unknown>

function pageClause(input: Input): {
  sql: string
  values: unknown[]
  limit: number
} {
  const limit = input.limit as number
  const cursor = cursorFrom(input.cursor)
  return {
    sql: cursor ? ' AND (created_at < ? OR (created_at = ? AND id < ?))' : '',
    values: cursor ? [cursor.at, cursor.at, cursor.id] : [],
    limit,
  }
}

export async function listDomains(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const page = pageClause(input)
  const result = await context.env.DB.prepare(
    `SELECT * FROM domains WHERE 1 = 1 ${page.sql}
    ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(...page.values, page.limit + 1)
    .all<Record<string, unknown>>()
  const rows = result.results.slice(0, page.limit)
  return {
    items: rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      fromAddress: row.from_address,
      replyTo: row.reply_to,
      relayUrl: row.relay_url,
      enabled: asBoolean(row.enabled),
    })),
    nextCursor:
      result.results.length > page.limit
        ? cursorFor({
            at: String(rows.at(-1)?.created_at),
            id: String(rows.at(-1)?.id),
          })
        : null,
  }
}

export async function upsertDomain(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const domain = inputString(input, 'domain')
  const requestedId = optionalString(input, 'id')
  const existing = await context.env.DB.prepare(
    `SELECT id, from_address, reply_to, relay_url
    FROM domains WHERE id = ? OR domain = ? LIMIT 1`,
  )
    .bind(requestedId ?? '', domain)
    .first<{
      id: string
      from_address: string | null
      reply_to: string | null
      relay_url: string | null
    }>()
  const id = existing?.id ?? requestedId ?? newId('dom')
  const now = nowIso()
  const fromAddress =
    input.fromAddress === undefined
      ? (existing?.from_address ?? null)
      : (optionalString(input, 'fromAddress') ?? null)
  const replyTo =
    input.replyTo === undefined
      ? (existing?.reply_to ?? null)
      : (optionalString(input, 'replyTo') ?? null)
  const relayUrl =
    input.relayUrl === undefined
      ? (existing?.relay_url ?? null)
      : input.relayUrl === null
        ? null
        : (optionalString(input, 'relayUrl') ?? null)
  const enabled = inputBoolean(input, 'enabled') ? 1 : 0

  if (existing) {
    await context.env.DB.prepare(
      `UPDATE domains SET domain = ?, from_address = ?, reply_to = ?,
        relay_url = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(domain, fromAddress, replyTo, relayUrl, enabled, now, id)
      .run()
  } else {
    await context.env.DB.prepare(
      `INSERT INTO domains
        (id, domain, from_address, reply_to, relay_url, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, domain, fromAddress, replyTo, relayUrl, enabled, now, now)
      .run()
  }
  return {
    id,
    domain,
    fromAddress,
    replyTo,
    relayUrl,
    enabled: Boolean(enabled),
  }
}

export async function listInboxes(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const page = pageClause(input)
  const domain = optionalString(input, 'domain')
  const result = await context.env.DB.prepare(
    `SELECT i.*, d.domain FROM inboxes i
    JOIN domains d ON d.id = i.domain_id
    WHERE (? IS NULL OR d.domain = ?) ${page.sql}
    ORDER BY i.created_at DESC, i.id DESC LIMIT ?`,
  )
    .bind(domain ?? null, domain ?? null, ...page.values, page.limit + 1)
    .all<Record<string, unknown>>()
  const rows = result.results.slice(0, page.limit)
  return {
    items: rows.map((row) => ({
      id: row.id,
      domain: row.domain,
      address: `${row.local_part}@${row.domain}`,
      localPart: row.local_part,
      name: row.name,
      enabled: asBoolean(row.enabled),
    })),
    nextCursor:
      result.results.length > page.limit
        ? cursorFor({
            at: String(rows.at(-1)?.created_at),
            id: String(rows.at(-1)?.id),
          })
        : null,
  }
}

export async function upsertInbox(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const domain = inputString(input, 'domain')
  const localPart = inputString(input, 'localPart')
  const domainRow = await context.env.DB.prepare(
    'SELECT id FROM domains WHERE domain = ? AND enabled = 1',
  )
    .bind(domain)
    .first<{ id: string }>()
  if (!domainRow) {
    throw new MailroomError('NOT_FOUND', `Domain ${domain} is not configured.`)
  }
  const requestedId = optionalString(input, 'id')
  const existing = await context.env.DB.prepare(
    `SELECT id FROM inboxes
    WHERE id = ? OR (domain_id = ? AND local_part = ?) LIMIT 1`,
  )
    .bind(requestedId ?? '', domainRow.id, localPart)
    .first<{ id: string }>()
  const id = existing?.id ?? requestedId ?? newId('inb')
  const name = inputString(input, 'name')
  const enabled = inputBoolean(input, 'enabled') ? 1 : 0
  const now = nowIso()
  if (existing) {
    await context.env.DB.prepare(
      `UPDATE inboxes SET domain_id = ?, local_part = ?, name = ?,
        enabled = ?, updated_at = ? WHERE id = ?`,
    )
      .bind(domainRow.id, localPart, name, enabled, now, id)
      .run()
  } else {
    await context.env.DB.prepare(
      `INSERT INTO inboxes
        (id, domain_id, local_part, name, enabled, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, domainRow.id, localPart, name, enabled, now, now)
      .run()
  }
  return {
    id,
    domain,
    address: `${localPart}@${domain}`,
    localPart,
    name,
    enabled: Boolean(enabled),
  }
}

export async function listRoutes(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const domain = optionalString(input, 'domain')
  const inboxId = optionalString(input, 'inboxId')
  const page = pageClause(input)
  const result = await context.env.DB.prepare(
    `SELECT r.*, d.domain FROM routes r
    JOIN domains d ON d.id = r.domain_id
    WHERE (? IS NULL OR d.domain = ?)
      AND (? IS NULL OR r.inbox_id = ?) ${page.sql}
    ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
  )
    .bind(
      domain ?? null,
      domain ?? null,
      inboxId ?? null,
      inboxId ?? null,
      ...page.values,
      page.limit + 1,
    )
    .all<Record<string, unknown>>()
  const rows = result.results.slice(0, page.limit)
  return {
    items: rows.map((row) => ({
      id: row.id,
      inboxId: row.inbox_id,
      domain: row.domain,
      kind: row.kind,
      localPart: row.local_part,
      enabled: asBoolean(row.enabled),
      priority: row.priority,
    })),
    nextCursor:
      result.results.length > page.limit
        ? cursorFor({
            at: String(rows.at(-1)?.created_at),
            id: String(rows.at(-1)?.id),
          })
        : null,
  }
}

export async function upsertRoute(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const inboxId = inputString(input, 'inboxId')
  const domain = inputString(input, 'domain')
  const domainRow = await context.env.DB.prepare(
    `SELECT d.id FROM domains d
    JOIN inboxes i ON i.domain_id = d.id
    WHERE d.domain = ? AND i.id = ?`,
  )
    .bind(domain, inboxId)
    .first<{ id: string }>()
  if (!domainRow) {
    throw new MailroomError(
      'NOT_FOUND',
      'The inbox does not belong to the requested domain.',
    )
  }
  const kind = inputString(input, 'kind')
  const localPart =
    input.localPart === null
      ? null
      : (optionalString(input, 'localPart') ?? null)
  const requestedId = optionalString(input, 'id')
  const existing = await context.env.DB.prepare(
    `SELECT id FROM routes WHERE id = ? OR (
      domain_id = ? AND kind = ? AND (
        (local_part IS NULL AND ? IS NULL) OR local_part = ?
      )
    ) LIMIT 1`,
  )
    .bind(requestedId ?? '', domainRow.id, kind, localPart, localPart)
    .first<{ id: string }>()
  const id = existing?.id ?? requestedId ?? newId('rte')
  const enabled = inputBoolean(input, 'enabled') ? 1 : 0
  const priority = inputNumber(input, 'priority')
  const now = nowIso()
  if (existing) {
    await context.env.DB.prepare(
      `UPDATE routes SET inbox_id = ?, domain_id = ?, kind = ?,
        local_part = ?, enabled = ?, priority = ?, updated_at = ?
      WHERE id = ?`,
    )
      .bind(inboxId, domainRow.id, kind, localPart, enabled, priority, now, id)
      .run()
  } else {
    await context.env.DB.prepare(
      `INSERT INTO routes
        (id, inbox_id, domain_id, kind, local_part, enabled, priority, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        inboxId,
        domainRow.id,
        kind,
        localPart,
        enabled,
        priority,
        now,
        now,
      )
      .run()
  }
  return {
    id,
    inboxId,
    domain,
    kind,
    localPart,
    enabled: Boolean(enabled),
    priority,
  }
}

export async function deleteRoute(
  context: OperationContext,
  input: Input,
): Promise<unknown> {
  const id = inputString(input, 'id')
  const result = await context.env.DB.prepare('DELETE FROM routes WHERE id = ?')
    .bind(id)
    .run()
  if (!result.meta.changes) {
    throw new MailroomError('NOT_FOUND', `Route ${id} does not exist.`)
  }
  return { id, deleted: true }
}
