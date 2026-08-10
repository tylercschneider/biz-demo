import type { FunnelEvent } from './events.js'
import { conversionRate } from './rates.js'

export type FunnelStats = {
  leadsCreated: number
  leadsQualified: number
  dealsWon: number
  qualificationRate: number
  winRate: number
  revenueCents: number
}

const countOf = (events: readonly FunnelEvent[], type: FunnelEvent['type']): number =>
  events.filter((event) => event.type === type).length

export const projectFunnel = (events: readonly FunnelEvent[]): FunnelStats => {
  const leadsCreated = countOf(events, 'lead_created')
  const leadsQualified = countOf(events, 'lead_qualified')
  const dealsWon = countOf(events, 'deal_won')

  return {
    leadsCreated,
    leadsQualified,
    dealsWon,
    qualificationRate: conversionRate(leadsCreated, leadsQualified),
    winRate: conversionRate(leadsQualified, dealsWon),
    revenueCents: events.reduce(
      (total, event) => (event.type === 'deal_won' ? total + event.amountCents : total),
      0
    )
  }
}
