import assert from 'node:assert/strict'
import test from 'node:test'
import {
  describeOperation,
  listOperations,
  parseOperationInput,
} from './operations.js'

test('operation discovery is compact and sorted', () => {
  const operations = listOperations()
  assert.ok(operations.length >= 20)
  assert.deepEqual(
    operations.map((item) => item.id),
    operations.map((item) => item.id).sort(),
  )
  const first = operations[0]
  assert.ok(first)
  assert.equal('inputSchema' in first, false)
})

test('describe exposes one JSON schema', () => {
  const description = describeOperation('messages.get')
  assert.equal(description.id, 'messages.get')
  assert.equal(description.inputSchema.type, 'object')
})

test('every operation exposes a JSON schema', () => {
  for (const operation of listOperations()) {
    const description = describeOperation(operation.id)
    assert.equal(description.id, operation.id)
    assert.equal(description.inputSchema.type, 'object')
  }
})

test('operation input applies defaults and rejects invalid values', () => {
  assert.deepEqual(parseOperationInput('messages.list', {}), { limit: 25 })
  assert.deepEqual(
    parseOperationInput('domains.upsert', { domain: 'EXAMPLE.COM' }),
    {
      domain: 'example.com',
      enabled: true,
    },
  )
  assert.throws(
    () => parseOperationInput('messages.get', { id: '' }),
    /Invalid operation parameters/,
  )
})
