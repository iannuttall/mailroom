import assert from 'node:assert/strict'
import test from 'node:test'
import { matchRoute } from './routing.js'
import type { RouteRecord } from './schemas.js'

const routes: RouteRecord[] = [
  {
    id: 'catchall',
    inboxId: 'general',
    domain: 'example.com',
    kind: 'catchall',
    localPart: null,
    enabled: true,
    priority: 100,
  },
  {
    id: 'exact',
    inboxId: 'ian',
    domain: 'example.com',
    kind: 'exact',
    localPart: 'ian',
    enabled: true,
    priority: 500,
  },
]

test('exact routes win over catch-all routes', () => {
  const result = matchRoute('IAN@example.com', routes)
  assert.equal(result.matched, true)
  if (result.matched) assert.equal(result.route.id, 'exact')
})

test('catch-all routes require an explicit record', () => {
  const result = matchRoute('other@example.com', routes)
  assert.equal(result.matched, true)
  if (result.matched) assert.equal(result.route.id, 'catchall')

  assert.deepEqual(matchRoute('other@different.com', routes), {
    matched: false,
    reason: 'no_route',
  })
})
