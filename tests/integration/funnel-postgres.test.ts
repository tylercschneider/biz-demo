import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createFunnel } from '../../src/funnel/funnel.js'
import { leadCreated, dealWon } from '../../src/funnel/events.js'
import { PostgresAppendOnlyStore, migrate } from '../../src/funnel/postgres-store.js'

const url = process.env['DATABASE_URL'] ?? 'postgres://biz:biz@127.0.0.1:5434/biz_demo'
const at = '2026-01-01T00:00:00Z'

let log: PostgresAppendOnlyStore

beforeAll(async () => {
  await migrate(url, 'funnel_test')
  log = new PostgresAppendOnlyStore(url, 'funnel_test')
})

afterAll(async () => {
  await log.close()
})

beforeEach(async () => {
  await log.truncate()
})

describe('a funnel backed by Postgres', () => {
  it('projects stats from events that round-tripped through the database', async () => {
    const funnel = createFunnel(log)

    await funnel.engine.emit(leadCreated, { leadId: 'a' }, at)
    await funnel.engine.emit(dealWon, { leadId: 'a', amountCents: 50_000 }, at)

    expect(await funnel.stats()).toMatchObject({ leadsCreated: 1, revenueCents: 50_000 })
  })

  it('leaves the events in Postgres, not in process memory', async () => {
    const funnel = createFunnel(log)

    await funnel.engine.emit(leadCreated, { leadId: 'a' }, at)

    const independent = new PostgresAppendOnlyStore(url, 'funnel_test')
    const page = await independent.readFrom(null, 100)
    await independent.close()

    expect(page.rows).toHaveLength(1)
  })
})
