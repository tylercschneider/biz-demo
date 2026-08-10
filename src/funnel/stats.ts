import type { StoredEvent } from '@eventengine/store'

export type FunnelStats = {
  leadsCreated: number
  leadsQualified: number
  dealsWon: number
}

const countOf = (events: readonly StoredEvent[], name: string): number =>
  events.filter((event) => event.name === name).length

export const projectFunnel = (events: readonly StoredEvent[]): FunnelStats => ({
  leadsCreated: countOf(events, 'lead.created'),
  leadsQualified: countOf(events, 'lead.qualified'),
  dealsWon: countOf(events, 'deal.won')
})
