import assert from 'node:assert/strict'
import test from 'node:test'
import { automationsConfigSchema } from './automation.js'

test('parses a bounded draft automation', () => {
  const config = automationsConfigSchema.parse({
    automations: [
      {
        id: 'triage',
        enabled: false,
        prompt: 'classify/triage',
        classification: 'needs-reply',
        minConfidence: 0.9,
        action: 'draft',
        approval: 'cli',
      },
    ],
  })

  assert.equal(config.automations[0]?.id, 'triage')
})
