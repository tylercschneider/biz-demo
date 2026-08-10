import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Server } from 'node:http'
import { createServer } from '../../src/server.js'
import { createFunnel } from '../../src/funnel/funnel.js'

let server: Server
let origin: string

beforeAll(async () => {
  server = createServer(createFunnel())
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no port bound')
  origin = `http://127.0.0.1:${address.port}`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
})

describe('the funnel service', () => {
  it('records an event and reports it in the stats', async () => {
    await fetch(`${origin}/events`, {
      method: 'POST',
      body: JSON.stringify({ name: 'lead.created', leadId: 'a' })
    })

    const response = await fetch(`${origin}/stats`)

    expect(await response.json()).toMatchObject({ leadsCreated: 1 })
  })
})
