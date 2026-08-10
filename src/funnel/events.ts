export type LeadCreated = { type: 'lead_created'; leadId: string }
export type LeadQualified = { type: 'lead_qualified'; leadId: string }
export type DealWon = { type: 'deal_won'; leadId: string; amountCents: number }

export type FunnelEvent = LeadCreated | LeadQualified | DealWon
