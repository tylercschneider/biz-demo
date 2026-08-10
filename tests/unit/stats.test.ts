import { describe, it, expect } from 'vitest'
import type { StoredEvent } from '@eventengine/store'
import { projectFunnel } from '../../src/funnel/stats.js'

const recorded = (name: string, payload: unknown): StoredEvent => ({
  name,
  occurredAt: '2026-01-01T00:00:00Z',
  payload
})

describe('projectFunnel', () => {
  it('counts each stage of the funnel', () => {
    const stats = projectFunnel([
      recorded('lead.created', { leadId: 'a' }),
      recorded('lead.created', { leadId: 'b' }),
      recorded('lead.qualified', { leadId: 'a' }),
      recorded('deal.won', { leadId: 'a', amountCents: 50_000 })
    ])

    expect(stats).toMatchObject({ leadsCreated: 2, leadsQualified: 1, dealsWon: 1 })
  })

  it('derives the stage-to-stage conversion rates', () => {
    const stats = projectFunnel([
      recorded('lead.created', { leadId: 'a' }),
      recorded('lead.created', { leadId: 'b' }),
      recorded('lead.qualified', { leadId: 'a' }),
      recorded('deal.won', { leadId: 'a', amountCents: 50_000 })
    ])

    expect(stats).toMatchObject({ qualificationRate: 0.5, winRate: 1 })
  })
})
