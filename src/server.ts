import { createServer as createHttpServer, type Server } from 'node:http'
import { leadCreated, leadQualified, dealWon } from './funnel/events.js'
import type { Funnel } from './funnel/funnel.js'
import { page } from './ui.js'

const definitions = {
  'lead.created': leadCreated,
  'lead.qualified': leadQualified,
  'deal.won': dealWon
}

const readBody = async (stream: AsyncIterable<Buffer>): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

const respond = (
  response: { writeHead(status: number, headers: Record<string, string>): void; end(body: string): void },
  status: number,
  body: unknown
): void => {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(body))
}

export const createServer = (funnel: Funnel): Server =>
  createHttpServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/health') {
      return respond(response, 200, { status: 'ok' })
    }

    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      return response.end(page())
    }

    if (request.method === 'POST' && request.url === '/events') {
      const { name, ...payload } = JSON.parse(await readBody(request)) as {
        name: keyof typeof definitions
      }
      const definition = definitions[name]

      if (definition === undefined) return respond(response, 404, { error: 'unknown event' })

      try {
        await funnel.engine.emit(definition, payload, new Date().toISOString())
      } catch {
        return respond(response, 422, { error: 'invalid payload' })
      }

      return respond(response, 202, { accepted: true })
    }

    if (request.method === 'GET' && request.url === '/stats') {
      return respond(response, 200, await funnel.stats())
    }

    return respond(response, 404, { error: 'not found' })
  })
