import { describe, it, expect } from 'vitest'
import { ZodError } from 'zod'
import { dealWon } from '../../src/funnel/events.js'

describe('dealWon', () => {
  it('carries the validated payload onto the event', () => {
    const event = dealWon.build({ leadId: 'a', amountCents: 50_000 }, '2026-01-01T00:00:00Z')

    expect(event.payload).toEqual({ leadId: 'a', amountCents: 50_000 })
  })

  it('refuses a deal booked for negative revenue', () => {
    expect(() =>
      dealWon.build({ leadId: 'a', amountCents: -1 }, '2026-01-01T00:00:00Z')
    ).toThrowError(ZodError)
  })
})
