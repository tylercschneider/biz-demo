import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'

const origin = 'http://127.0.0.1:3111'

let app: ChildProcess

const waitForHealthy = async (attempts: number): Promise<void> => {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${origin}/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('the app never became healthy')
}

beforeAll(async () => {
  app = spawn('node', ['dist/index.js'], {
    env: { ...process.env, PORT: '3111' },
    stdio: 'ignore'
  })
  await waitForHealthy(50)
})

afterAll(async () => {
  app.kill('SIGTERM')
  await once(app, 'exit')
})

describe('the deployed funnel service', () => {
  it('reports the funnel a sales team actually worked', async () => {
    const events = [
      { name: 'lead.created', leadId: 'a' },
      { name: 'lead.created', leadId: 'b' },
      { name: 'lead.qualified', leadId: 'a' },
      { name: 'deal.won', leadId: 'a', amountCents: 50_000 }
    ]

    for (const event of events) {
      await fetch(`${origin}/events`, { method: 'POST', body: JSON.stringify(event) })
    }

    const response = await fetch(`${origin}/stats`)

    expect(await response.json()).toEqual({
      leadsCreated: 2,
      leadsQualified: 1,
      dealsWon: 1,
      qualificationRate: 0.5,
      winRate: 1,
      revenueCents: 50_000
    })
  })
})
