import { describe, it, expect } from 'vitest'
import { EventStore } from '../../src/funnel/store.js'

describe('EventStore', () => {
  it('reads back the events it appended, in order', () => {
    const store = new EventStore()

    store.append({ type: 'lead_created', leadId: 'a' })
    store.append({ type: 'lead_qualified', leadId: 'a' })

    expect(store.all()).toEqual([
      { type: 'lead_created', leadId: 'a' },
      { type: 'lead_qualified', leadId: 'a' }
    ])
  })
})
