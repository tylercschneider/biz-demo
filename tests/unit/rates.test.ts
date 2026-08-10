import { describe, it, expect } from 'vitest'
import { conversionRate } from '../../src/funnel/rates.js'

describe('conversionRate', () => {
  it('returns the share of the starting cohort that advanced', () => {
    expect(conversionRate(50, 10)).toBe(0.2)
  })
})
