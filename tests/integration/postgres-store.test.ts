import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { StoredEvent } from '@eventengine/store'
import { PostgresAppendOnlyStore, migrate } from '../../src/funnel/postgres-store.js'

const url = process.env['DATABASE_URL'] ?? 'postgres://biz:biz@127.0.0.1:5434/biz_demo'

let store: PostgresAppendOnlyStore

beforeAll(async () => {
  store = new PostgresAppendOnlyStore(url, 'store_test')
  await migrate(url, 'store_test')
})

afterAll(async () => {
  await store.close()
})

beforeEach(async () => {
  await store.truncate()
})

const event = (leadId: string): StoredEvent => ({
  name: 'lead.created',
  occurredAt: '2026-01-01T00:00:00Z',
  payload: { leadId }
})

describe('PostgresAppendOnlyStore', () => {
  it('reads back an appended event', async () => {
    await store.append(event('a'))

    const page = await store.readFrom(null, 100)

    expect(page.rows).toEqual([event('a')])
  })

  it('pages through the log with a cursor', async () => {
    await store.append(event('a'))
    await store.append(event('b'))

    const first = await store.readFrom(null, 1)
    const second = await store.readFrom(first.next, 1)

    expect(second.rows).toEqual([event('b')])
  })

  it('reports no cursor once the log is exhausted', async () => {
    await store.append(event('a'))

    const page = await store.readFrom(null, 100)

    expect(page.next).toBeNull()
  })
})
