import { createServer as createHttpServer, type Server } from 'node:http'
import type { EventStore } from './funnel/store.js'
import type { FunnelEvent } from './funnel/events.js'
import { projectFunnel } from './funnel/projection.js'

const readBody = async (stream: AsyncIterable<Buffer>): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export const createServer = (store: EventStore): Server =>
  createHttpServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (request.method === 'POST' && request.url === '/events') {
      store.append(JSON.parse(await readBody(request)) as FunnelEvent)
      response.writeHead(202, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ accepted: true }))
      return
    }

    if (request.method === 'GET' && request.url === '/stats') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(projectFunnel(store.all())))
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
