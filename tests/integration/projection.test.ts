import { describe, it, expect } from 'vitest'
import { EventStore } from '../../src/funnel/store.js'
import { projectFunnel } from '../../src/funnel/projection.js'

describe('projectFunnel over a populated EventStore', () => {
  it('counts each stage of the funnel', () => {
    const store = new EventStore()
    store.append({ type: 'lead_created', leadId: 'a' })
    store.append({ type: 'lead_created', leadId: 'b' })
    store.append({ type: 'lead_qualified', leadId: 'a' })
    store.append({ type: 'deal_won', leadId: 'a', amountCents: 50_000 })

    const stats = projectFunnel(store.all())

    expect(stats).toMatchObject({
      leadsCreated: 2,
      leadsQualified: 1,
      dealsWon: 1
    })
  })

  it('derives the stage-to-stage conversion rates', () => {
    const store = new EventStore()
    store.append({ type: 'lead_created', leadId: 'a' })
    store.append({ type: 'lead_created', leadId: 'b' })
    store.append({ type: 'lead_qualified', leadId: 'a' })
    store.append({ type: 'deal_won', leadId: 'a', amountCents: 50_000 })

    const stats = projectFunnel(store.all())

    expect(stats).toMatchObject({ qualificationRate: 0.5, winRate: 1 })
  })
})
