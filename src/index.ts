import { createServer } from './server.js'
import { EventStore } from './funnel/store.js'

const port = Number(process.env['PORT'] ?? 3000)
const server = createServer(new EventStore())

server.listen(port, () => {
  console.log(`biz-demo listening on http://127.0.0.1:${port}`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
