import assert from 'node:assert/strict'
import test from 'node:test'
import { applyOutputBudget } from './output-budget.js'

test('keeps small output intact', () => {
  const source = { messages: [{ id: 'one' }] }
  const result = applyOutputBudget(source, 1_024)
  assert.deepEqual(result.value, source)
  assert.equal(result.budget.truncated, false)
})

test('truncates large agent output and reports omissions', () => {
  const source = {
    messages: Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      body: 'x'.repeat(5_000),
    })),
  }
  const result = applyOutputBudget(source, 8_000)
  assert.equal(result.budget.truncated, true)
  assert.ok(result.budget.returnedBytes <= 8_000)
  assert.ok(result.budget.omissions.length > 0)
})
