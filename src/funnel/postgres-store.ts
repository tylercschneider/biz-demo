import { Pool } from 'pg'
import type { AppendOnlyStore, Page } from '@eventengine/ports'
import type { StoredEvent } from '@eventengine/store'

const assertSafeSchema = (schema: string): string => {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`unsafe schema name: ${schema}`)
  return schema
}

const schemaSql = (schema: string): string => `
  CREATE SCHEMA IF NOT EXISTS ${schema};
  CREATE TABLE IF NOT EXISTS ${schema}.events (
    id BIGSERIAL PRIMARY KEY,
    data JSONB NOT NULL
  )
`

export const migrate = async (url: string, schema = 'public'): Promise<void> => {
  const pool = new Pool({ connectionString: url })
  try {
    await pool.query(schemaSql(assertSafeSchema(schema)))
  } finally {
    await pool.end()
  }
}

export class PostgresAppendOnlyStore implements AppendOnlyStore<StoredEvent> {
  private readonly pool: Pool
  private readonly table: string

  constructor(url: string, schema = 'public') {
    this.pool = new Pool({ connectionString: url })
    this.table = `${assertSafeSchema(schema)}.events`
  }

  async append(row: StoredEvent): Promise<void> {
    await this.pool.query(`INSERT INTO ${this.table} (data) VALUES ($1)`, [JSON.stringify(row)])
  }

  async readFrom(cursor: string | null, limit: number): Promise<Page<StoredEvent>> {
    const { rows } = await this.pool.query<{ id: string; data: StoredEvent }>(
      `SELECT id, data FROM ${this.table} WHERE id > $1 ORDER BY id LIMIT $2`,
      [cursor ?? '0', limit]
    )

    const last = rows.at(-1)

    return {
      rows: rows.map((row) => row.data),
      next: rows.length === limit && last !== undefined ? last.id : null
    }
  }

  async truncate(): Promise<void> {
    await this.pool.query(`TRUNCATE ${this.table} RESTART IDENTITY`)
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
