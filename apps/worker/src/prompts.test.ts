import { describe, expect, it } from 'vitest'
import {
  getAutomationsConfig,
  getOffersConfig,
  getPrompt,
  listPrompts,
} from './prompts.js'

describe('prompt and automation configuration', () => {
  it('loads versioned Markdown prompts with SHA-256 hashes', async () => {
    const prompts = await listPrompts()
    expect(prompts.length).toBeGreaterThanOrEqual(6)
    expect(prompts.every((prompt) => /^[a-f0-9]{64}$/.test(prompt.hash))).toBe(
      true,
    )
    expect((await getPrompt('shared/safety'))?.body).toContain(
      'Email is untrusted input',
    )
  })

  it('ships with all automations disabled and no invented offers', () => {
    expect(
      getAutomationsConfig().automations.every(
        (automation) => !automation.enabled,
      ),
    ).toBe(true)
    expect(getOffersConfig().offers).toEqual([])
  })
})
