import { defineEvent } from '@eventengine/core'
import { z } from 'zod'

export const leadCreated = defineEvent({
  name: 'lead.created',
  version: 1,
  processType: 'inline',
  schema: z.object({ leadId: z.string().min(1) })
})

export const leadQualified = defineEvent({
  name: 'lead.qualified',
  version: 1,
  processType: 'inline',
  schema: z.object({ leadId: z.string().min(1) })
})

export const dealWon = defineEvent({
  name: 'deal.won',
  version: 1,
  processType: 'inline',
  schema: z.object({
    leadId: z.string().min(1),
    amountCents: z.number().int().nonnegative()
  })
})
