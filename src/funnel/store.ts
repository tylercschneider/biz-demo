import type { FunnelEvent } from './events.js'

export class EventStore {
  private readonly events: FunnelEvent[] = []

  append(event: FunnelEvent): void {
    this.events.push(event)
  }

  all(): readonly FunnelEvent[] {
    return [...this.events]
  }
}
