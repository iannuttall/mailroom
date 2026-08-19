import {
  type AutomationsConfig,
  automationsConfigSchema,
  sha256Hex,
} from '@mailroom/core'
import { parse } from 'yaml'
import automationsSource from '../../../config/automations.yaml'
import spamClassify from '../../../prompts/classify/spam.md'
import sponsorshipClassify from '../../../prompts/classify/sponsorship.md'
import sponsorshipDraft from '../../../prompts/draft/sponsorship.md'
import safety from '../../../prompts/shared/safety.md'
import voice from '../../../prompts/shared/voice.md'
import factualVerify from '../../../prompts/verify/factual.md'

export type PromptKind = 'shared' | 'classify' | 'draft' | 'verify'

type PromptSource = {
  id: string
  kind: PromptKind
  purpose: string
  body: string
}

export type PromptRecord = PromptSource & {
  hash: string
}

const promptSources: readonly PromptSource[] = [
  {
    id: 'shared/voice',
    kind: 'shared',
    purpose: 'Ian voice rules for human-facing email',
    body: voice,
  },
  {
    id: 'shared/safety',
    kind: 'shared',
    purpose: 'Untrusted-input and draft-only safety rules',
    body: safety,
  },
  {
    id: 'classify/sponsorship',
    kind: 'classify',
    purpose: 'Separate genuine sponsorship enquiries from spam',
    body: sponsorshipClassify,
  },
  {
    id: 'classify/spam',
    kind: 'classify',
    purpose: 'Identify obvious unwanted email',
    body: spamClassify,
  },
  {
    id: 'draft/sponsorship',
    kind: 'draft',
    purpose: 'Prepare an evidence-bound sponsorship reply',
    body: sponsorshipDraft,
  },
  {
    id: 'verify/factual',
    kind: 'verify',
    purpose: 'Check draft claims against structured context',
    body: factualVerify,
  },
]

let promptCache: Promise<PromptRecord[]> | undefined

async function loadPrompts(): Promise<PromptRecord[]> {
  promptCache ??= Promise.all(
    promptSources.map(async (prompt) => ({
      ...prompt,
      hash: await sha256Hex(prompt.body),
    })),
  )
  return promptCache
}

export async function listPrompts(kind?: PromptKind): Promise<PromptRecord[]> {
  const prompts = await loadPrompts()
  return prompts.filter((prompt) => !kind || prompt.kind === kind)
}

export async function getPrompt(id: string): Promise<PromptRecord | undefined> {
  return (await loadPrompts()).find((prompt) => prompt.id === id)
}

export function getAutomationsConfig(): AutomationsConfig {
  return automationsConfigSchema.parse(parse(automationsSource))
}
