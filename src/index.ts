import { createServer } from './server.js'
import { createFunnel } from './funnel/funnel.js'
import { PostgresAppendOnlyStore, migrate } from './funnel/postgres-store.js'

const port = Number(process.env['PORT'] ?? 3000)
const databaseUrl = process.env['DATABASE_URL']
const schema = process.env['DATABASE_SCHEMA'] ?? 'public'

const log = async () => {
  if (databaseUrl === undefined) return undefined
  await migrate(databaseUrl, schema)
  return new PostgresAppendOnlyStore(databaseUrl, schema)
}

const server = createServer(createFunnel(await log()))

server.listen(port, () => {
  console.log(`biz-demo listening on http://127.0.0.1:${port}`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
