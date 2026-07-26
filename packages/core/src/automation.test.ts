import assert from 'node:assert/strict'
import test from 'node:test'
import { type OffersConfig, validateDraftAgainstOffers } from './automation.js'

const config: OffersConfig = {
  offers: [
    {
      id: 'newsletter',
      name: 'Newsletter sponsorship',
      enabled: true,
      expiresAt: null,
      prices: [
        {
          id: 'single',
          label: 'One issue',
          amount: 500,
          currency: 'GBP',
          display: '£500',
        },
      ],
      allowedLinks: ['https://example.com/sponsor'],
    },
  ],
}

test('accepts configured prices and links', () => {
  assert.deepEqual(
    validateDraftAgainstOffers(
      'One issue is £500. Details: https://example.com/sponsor',
      config,
      ['newsletter'],
    ),
    { valid: true, issues: [] },
  )
})

test('rejects invented prices and links', () => {
  const result = validateDraftAgainstOffers(
    'The price is £750. Pay at https://example.com/other',
    config,
    ['newsletter'],
  )
  assert.equal(result.valid, false)
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ['UNKNOWN_PRICE', 'UNKNOWN_LINK'],
  )
})
