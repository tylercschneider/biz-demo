import type { StoredEvent } from '@eventengine/store'
import { z } from 'zod'
import { conversionRate } from './rates.js'

export type FunnelStats = {
  leadsCreated: number
  leadsQualified: number
  dealsWon: number
  qualificationRate: number
  winRate: number
  revenueCents: number
}

const wonDealPayload = z.object({ amountCents: z.number() })

const eventsNamed = (events: readonly StoredEvent[], name: string): StoredEvent[] =>
  events.filter((event) => event.name === name)

export const projectFunnel = (events: readonly StoredEvent[]): FunnelStats => {
  const leadsCreated = eventsNamed(events, 'lead.created').length
  const leadsQualified = eventsNamed(events, 'lead.qualified').length
  const wonDeals = eventsNamed(events, 'deal.won')

  return {
    leadsCreated,
    leadsQualified,
    dealsWon: wonDeals.length,
    qualificationRate: conversionRate(leadsCreated, leadsQualified),
    winRate: conversionRate(leadsQualified, wonDeals.length),
    revenueCents: wonDeals.reduce(
      (total, event) => total + wonDealPayload.parse(event.payload).amountCents,
      0
    )
  }
}
