import { MailroomError, splitEmailAddress } from '@mailroom/core'
import { asBoolean } from './database.js'

type RouteRow = {
  route_id: string
  inbox_id: string
  domain_id: string
  domain: string
  kind: 'exact' | 'catchall'
  local_part: string | null
  enabled: number
  priority: number
  inbox_enabled: number
}

export type InboundRoute = {
  routeId: string
  inboxId: string
  domainId: string
  domain: string
  kind: 'exact' | 'catchall'
  localPart: string | null
}

export async function findInboundRoute(
  db: D1Database,
  recipient: string,
): Promise<InboundRoute | null> {
  const parsed = splitEmailAddress(recipient)
  if (!parsed) return null

  const row = await db
    .prepare(
      `SELECT
        r.id AS route_id,
        r.inbox_id,
        r.domain_id,
        d.domain,
        r.kind,
        r.local_part,
        r.enabled,
        r.priority,
        i.enabled AS inbox_enabled
      FROM routes r
      JOIN domains d ON d.id = r.domain_id
      JOIN inboxes i ON i.id = r.inbox_id
      WHERE d.domain = ?
        AND d.enabled = 1
        AND r.enabled = 1
        AND i.enabled = 1
        AND (
          (r.kind = 'exact' AND r.local_part = ?)
          OR r.kind = 'catchall'
        )
      ORDER BY
        CASE r.kind WHEN 'exact' THEN 0 ELSE 1 END,
        r.priority ASC
      LIMIT 1`,
    )
    .bind(parsed.domain, parsed.localPart)
    .first<RouteRow>()

  if (!row || !asBoolean(row.enabled) || !asBoolean(row.inbox_enabled)) {
    return null
  }
  return {
    routeId: row.route_id,
    inboxId: row.inbox_id,
    domainId: row.domain_id,
    domain: row.domain,
    kind: row.kind,
    localPart: row.local_part,
  }
}

export async function requireInboundRoute(
  db: D1Database,
  recipient: string,
): Promise<InboundRoute> {
  const route = await findInboundRoute(db, recipient)
  if (!route) {
    throw new MailroomError(
      'NOT_FOUND',
      `No enabled Mailroom route matches ${recipient}.`,
    )
  }
  return route
}
