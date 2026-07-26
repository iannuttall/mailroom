import { describe, expect, it } from 'vitest'
import { emailAddresses, firstEmailAddress } from './email-addresses.js'

describe('parsed email addresses', () => {
  it('flattens mailbox groups and normalizes addresses', () => {
    const addresses = [
      { name: 'Ian', address: 'IAN@example.com' },
      {
        name: 'People',
        group: [
          { name: 'One', address: 'one@example.com' },
          { name: 'Two', address: 'two@example.com' },
        ],
      },
    ]
    expect(emailAddresses(addresses)).toEqual([
      'ian@example.com',
      'one@example.com',
      'two@example.com',
    ])
    expect(firstEmailAddress(addresses[1])).toBe('one@example.com')
  })
})
