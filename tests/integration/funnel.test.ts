import { describe, it, expect } from 'vitest'
import { createFunnel } from '../../src/funnel/funnel.js'
import { leadCreated, leadQualified, dealWon } from '../../src/funnel/events.js'

const at = '2026-01-01T00:00:00Z'

describe('a funnel wired to the event engine and store', () => {
  it('reports stats built from the events it recorded', async () => {
    const funnel = createFunnel()

    await funnel.engine.emit(leadCreated, { leadId: 'a' }, at)
    await funnel.engine.emit(leadCreated, { leadId: 'b' }, at)
    await funnel.engine.emit(leadQualified, { leadId: 'a' }, at)
    await funnel.engine.emit(dealWon, { leadId: 'a', amountCents: 50_000 }, at)

    expect(await funnel.stats()).toEqual({
      leadsCreated: 2,
      leadsQualified: 1,
      dealsWon: 1,
      qualificationRate: 0.5,
      winRate: 1,
      revenueCents: 50_000
    })
  })
})
