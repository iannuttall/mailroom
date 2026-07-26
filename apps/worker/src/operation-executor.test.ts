import { listOperations } from '@mailroom/core'
import { describe, expect, it } from 'vitest'
import { missingOperationHandlers } from './operation-executor.js'

describe('operation executor', () => {
  it('implements every operation in the shared registry', () => {
    expect(
      missingOperationHandlers(
        listOperations().map((operation) => operation.id),
      ),
    ).toEqual([])
  })
})
