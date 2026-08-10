import type { FunnelEvent } from './events.js'

export type FunnelStats = {
  leadsCreated: number
  leadsQualified: number
  dealsWon: number
}

const countOf = (events: readonly FunnelEvent[], type: FunnelEvent['type']): number =>
  events.filter((event) => event.type === type).length

export const projectFunnel = (events: readonly FunnelEvent[]): FunnelStats => ({
  leadsCreated: countOf(events, 'lead_created'),
  leadsQualified: countOf(events, 'lead_qualified'),
  dealsWon: countOf(events, 'deal_won')
})
