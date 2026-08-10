import { EventEngine } from '@eventengine/core'
import { EventStore, type StoredEvent } from '@eventengine/store'
import { InMemoryAppendOnlyStore } from '@eventengine/ports'
import { projectFunnel, type FunnelStats } from './stats.js'

export type Funnel = {
  engine: EventEngine
  stats(): Promise<FunnelStats>
}

export const createFunnel = (): Funnel => {
  const store = new EventStore(new InMemoryAppendOnlyStore<StoredEvent>())
  const engine = new EventEngine()

  engine.registerHandler(store.recorder(), 'all')

  return {
    engine,
    stats: async () => projectFunnel(await store.all())
  }
}
