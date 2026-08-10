import type { StoredEvent } from '@eventengine/store'
import { conversionRate } from './rates.js'

export type FunnelStats = {
  leadsCreated: number
  leadsQualified: number
  dealsWon: number
  qualificationRate: number
  winRate: number
}

const countOf = (events: readonly StoredEvent[], name: string): number =>
  events.filter((event) => event.name === name).length

export const projectFunnel = (events: readonly StoredEvent[]): FunnelStats => {
  const leadsCreated = countOf(events, 'lead.created')
  const leadsQualified = countOf(events, 'lead.qualified')
  const dealsWon = countOf(events, 'deal.won')

  return {
    leadsCreated,
    leadsQualified,
    dealsWon,
    qualificationRate: conversionRate(leadsCreated, leadsQualified),
    winRate: conversionRate(leadsQualified, dealsWon)
  }
}
