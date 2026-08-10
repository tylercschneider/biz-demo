import { Pool } from 'pg'
import type { AppendOnlyStore, Page } from '@eventengine/ports'
import type { StoredEvent } from '@eventengine/store'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS events (
    id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL
  )
`

export const migrate = async (url: string): Promise<void> => {
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(SCHEMA)
  } finally {
    await pool.end()
  }
}

export class PostgresAppendOnlyStore implements AppendOnlyStore<StoredEvent> {
  private readonly pool: Pool

  constructor(url: string) {
    this.pool = new Pool({ connectionString: url })
  }

  async append(row: StoredEvent): Promise<void> {
    await this.pool.query('INSERT INTO events (data) VALUES ($1)', [JSON.stringify(row)])
  }

  async readFrom(cursor: string | null, limit: number): Promise<Page<StoredEvent>> {
    const { rows } = await this.pool.query<{ id: string; data: StoredEvent }>(
      'SELECT id, data FROM events WHERE id > $1 ORDER BY id LIMIT $2',
      [cursor ?? '0', limit]
    )

    const last = rows.at(-1)

    return {
      rows: rows.map((row) => row.data),
      next: rows.length === limit && last !== undefined ? last.id : null
    }
  }

  async truncate(): Promise<void> {
    await this.pool.query('TRUNCATE events RESTART IDENTITY')
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
