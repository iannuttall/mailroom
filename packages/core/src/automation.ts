import * as z from 'zod/v4'

export const offerPriceSchema = z.object({
  id: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  amount: z.number().nonnegative(),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
  display: z.string().trim().min(1).max(80),
})

export const offerSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  enabled: z.boolean().default(true),
  expiresAt: z.string().date().nullable().default(null),
  prices: z.array(offerPriceSchema).max(50),
  allowedLinks: z.array(z.url()).max(50).default([]),
})

export const offersConfigSchema = z.object({
  offers: z.array(offerSchema).max(100),
})
export type OffersConfig = z.infer<typeof offersConfigSchema>

export const automationSchema = z.object({
  id: z.string().trim().min(1).max(64),
  enabled: z.boolean().default(false),
  prompt: z.string().trim().min(1).max(128),
  classification: z.string().trim().min(1).max(64),
  minConfidence: z.number().min(0).max(1).default(0.9),
  action: z.literal('draft'),
  approval: z.enum(['telegram', 'cli', 'mcp']).default('telegram'),
  offerIds: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
})

export const automationsConfigSchema = z.object({
  automations: z.array(automationSchema).max(100),
})
export type AutomationsConfig = z.infer<typeof automationsConfigSchema>

export type DraftValidationIssue = {
  code: 'UNKNOWN_PRICE' | 'UNKNOWN_LINK' | 'EXPIRED_OFFER' | 'MISSING_OFFER'
  value: string
  detail: string
}

const priceClaimPattern =
  /(?:£|\$|€)\s?\d[\d,.]*(?:\s?(?:\/|per\s+)(?:month|week|issue|video|post))?/gi
const urlPattern = /https?:\/\/[^\s<>"')\]]+/gi

function normalizeClaim(value: string): string {
  return value
    .replaceAll(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '')
    .toLowerCase()
}

export function validateDraftAgainstOffers(
  draft: string,
  config: OffersConfig,
  offerIds: readonly string[],
  now = new Date(),
): { valid: boolean; issues: DraftValidationIssue[] } {
  const selected = offerIds.map((id) =>
    config.offers.find((offer) => offer.id === id && offer.enabled),
  )
  const issues: DraftValidationIssue[] = []

  for (const [index, offer] of selected.entries()) {
    if (!offer) {
      issues.push({
        code: 'MISSING_OFFER',
        value: offerIds[index] ?? '',
        detail: 'The automation references an unavailable offer.',
      })
    }
  }

  const available = selected.filter((offer) => offer !== undefined)
  const allowedPrices = new Set(
    available.flatMap((offer) =>
      offer.prices.map((price) => normalizeClaim(price.display)),
    ),
  )
  const allowedLinks = new Set(available.flatMap((offer) => offer.allowedLinks))

  for (const claim of draft.match(priceClaimPattern) ?? []) {
    if (!allowedPrices.has(normalizeClaim(claim))) {
      issues.push({
        code: 'UNKNOWN_PRICE',
        value: claim,
        detail:
          'The draft contains a price not present in the selected offers.',
      })
    }
  }

  for (const link of draft.match(urlPattern) ?? []) {
    const normalized = link.replace(/[.,;:!?]+$/, '')
    if (!allowedLinks.has(normalized)) {
      issues.push({
        code: 'UNKNOWN_LINK',
        value: normalized,
        detail: 'The draft contains a link not allowed by the selected offers.',
      })
    }
  }

  for (const offer of available) {
    if (offer.expiresAt && new Date(offer.expiresAt) < now) {
      issues.push({
        code: 'EXPIRED_OFFER',
        value: offer.id,
        detail: 'The selected offer has expired.',
      })
    }
  }

  return { valid: issues.length === 0, issues }
}
