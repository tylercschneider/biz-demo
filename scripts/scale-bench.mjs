import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'

const DIR = 'tests/_scale'

const unitTest = (i) => `
  it('case ${i}', () => {
    expect(conversionRate(${i + 1}, ${i})).toBeCloseTo(${i} / ${i + 1})
  })`

const integrationTest = (i) => `
  it('case ${i}', async () => {
    const funnel = createFunnel()
    await funnel.engine.emit(leadCreated, { leadId: 'l${i}' }, at)
    await funnel.engine.emit(dealWon, { leadId: 'l${i}', amountCents: ${i} }, at)
    expect((await funnel.stats()).revenueCents).toBe(${i})
  })`

const smokeTest = (i) => `
  it('case ${i}', async () => {
    const response = await fetch(origin + '/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'lead.created', leadId: 'l${i}' })
    })
    expect(response.status).toBe(202)
  })`

const e2eTest = (i) => `
  it('case ${i}', async () => {
    const response = await fetch(origin + '/events', {
      method: 'POST',
      body: JSON.stringify({ name: 'lead.created', leadId: 'l${i}' })
    })
    expect(response.status).toBe(202)
  })`

const unitFile = (n, f) => `import { describe, it, expect } from 'vitest'
import { conversionRate } from '../../src/funnel/rates.js'
describe('scale unit ${f}', () => {${Array.from({ length: n }, (_, i) => unitTest(i)).join('')}
})
`

const integrationFile = (n, f) => `import { describe, it, expect } from 'vitest'
import { createFunnel } from '../../src/funnel/funnel.js'
import { leadCreated, dealWon } from '../../src/funnel/events.js'
const at = '2026-01-01T00:00:00Z'
describe('scale integration ${f}', () => {${Array.from({ length: n }, (_, i) => integrationTest(i)).join('')}
})
`

const smokeFile = (n, f) => `import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer } from '../../src/server.js'
import { createFunnel } from '../../src/funnel/funnel.js'
let server, origin
beforeAll(async () => {
  server = createServer(createFunnel())
  await new Promise((resolve) => server.listen(0, resolve))
  origin = 'http://127.0.0.1:' + server.address().port
})
afterAll(async () => { await new Promise((r) => server.close(r)) })
describe('scale smoke ${f}', () => {${Array.from({ length: n }, (_, i) => smokeTest(i)).join('')}
})
`

const e2eFile = (n, f) => `import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
const port = ${4000 + Number(f) * 7}
const origin = 'http://127.0.0.1:' + port
let app
beforeAll(async () => {
  app = spawn('node', ['dist/index.js'], { env: { ...process.env, PORT: String(port) }, stdio: 'ignore' })
  for (let a = 0; a < 100; a += 1) {
    try { if ((await fetch(origin + '/health')).ok) return } catch { await new Promise((r) => setTimeout(r, 50)) }
  }
  throw new Error('never healthy')
})
afterAll(async () => { app.kill('SIGTERM'); await once(app, 'exit') })
describe('scale e2e ${f}', () => {${Array.from({ length: n }, (_, i) => e2eTest(i)).join('')}
})
`

const builders = { unit: unitFile, integration: integrationFile, smoke: smokeFile, e2e: e2eFile }

const run = (level, files, perFile) => {
  rmSync(DIR, { recursive: true, force: true })
  mkdirSync(DIR, { recursive: true })
  for (let f = 0; f < files; f += 1) {
    writeFileSync(`${DIR}/${level}${f}.test.ts`, builders[level](perFile, String(f)))
  }
  const started = Date.now()
  execSync(`npx vitest run ${DIR}`, { stdio: 'ignore' })
  const elapsed = Date.now() - started
  rmSync(DIR, { recursive: true, force: true })
  return elapsed
}

const DEFAULT_PLAN = [
  ['unit', 100, 10],
  ['integration', 100, 10],
  ['smoke', 100, 10],
  ['e2e', 100, 10]
]

const plans = process.argv[2] === undefined ? DEFAULT_PLAN : JSON.parse(process.argv[2])
const results = []
for (const [level, files, perFile] of plans) {
  const ms = run(level, files, perFile)
  results.push({ level, files, perFile, total: files * perFile, ms })
  console.log(`${level}\tfiles=${files}\tper_file=${perFile}\ttests=${files * perFile}\tms=${ms}`)
}
writeFileSync('scripts/scale-results.json', JSON.stringify(results, null, 2))
