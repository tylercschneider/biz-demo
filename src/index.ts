import { createServer } from './server.js'
import { createFunnel } from './funnel/funnel.js'

const port = Number(process.env['PORT'] ?? 3000)
const server = createServer(createFunnel())

server.listen(port, () => {
  console.log(`biz-demo listening on http://127.0.0.1:${port}`)
})

process.on('SIGTERM', () => {
  server.close(() => process.exit(0))
})
