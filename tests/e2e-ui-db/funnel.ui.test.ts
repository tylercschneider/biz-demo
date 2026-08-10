import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { PostgresAppendOnlyStore, migrate } from '../../src/funnel/postgres-store.js'

const url = process.env['DATABASE_URL'] ?? 'postgres://biz:biz@127.0.0.1:5434/biz_demo'
const schema = 'ui_test'
const port = 3777
const origin = `http://127.0.0.1:${port}`

let browser: Browser
let page: Page
let app: ChildProcess
let log: PostgresAppendOnlyStore

const waitForHealthy = async (attempts: number): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      if ((await fetch(`${origin}/health`)).ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('the app never became healthy')
}

beforeAll(async () => {
  await migrate(url, schema)
  log = new PostgresAppendOnlyStore(url, schema)

  app = spawn('node', ['dist/index.js'], {
    env: { ...process.env, PORT: String(port), DATABASE_URL: url, DATABASE_SCHEMA: schema },
    stdio: 'ignore'
  })
  await waitForHealthy(100)

  browser = await chromium.launch()
  page = await browser.newPage()
})

afterAll(async () => {
  await browser.close()
  app.kill('SIGTERM')
  await once(app, 'exit')
  await log.close()
})

beforeEach(async () => {
  await log.truncate()
  await page.goto(origin)
})

const record = async (name: string, leadId: string, amountCents?: number): Promise<void> => {
  await page.selectOption('#name', name)
  await page.fill('#leadId', leadId)
  if (amountCents !== undefined) await page.fill('#amountCents', String(amountCents))
  await page.click('#record')
}

describe('the funnel, driven through the browser into Postgres', () => {
  it('shows the revenue a user booked through the form', async () => {
    await record('lead.created', 'a')
    await record('lead.qualified', 'a')
    await record('deal.won', 'a', 50_000)

    await expect.poll(() => page.textContent('#revenueCents')).toBe('50000')
  })

  it('persists what the user recorded to the database', async () => {
    await record('lead.created', 'a')
    await expect.poll(() => page.textContent('#leadsCreated')).toBe('1')

    const stored = await log.readFrom(null, 100)

    expect(stored.rows.map((row) => row.name)).toEqual(['lead.created'])
  })

  it('shows the user an error when the schema refuses the payload', async () => {
    await record('deal.won', 'a', -1)

    await expect.poll(() => page.textContent('#error')).toContain('Rejected')
  })
})
