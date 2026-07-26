import { describe, expect, it } from 'vitest'
import { allowedFromDomain } from './index.js'

describe('outbound domain allowlist', () => {
  it('requires an exact normalized domain match', () => {
    expect(allowedFromDomain('ian.is, swipe.md', 'Ian@SWIPE.MD')).toBe(true)
    expect(allowedFromDomain('swipe.md', 'ian@attacker-swipe.md')).toBe(false)
  })
})
