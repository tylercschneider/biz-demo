# biz-demo

A TypeScript sales-funnel service — **lead created → lead qualified → deal won** —
built on the [`event-engine`](https://github.com/DYB-Development/event-engine) packages,
that exists to demonstrate the four levels of automated testing side by side:
**unit**, **integration**, **smoke**, and **end-to-end**.

Events are defined with `@eventengine/core`, recorded and replayed through
`@eventengine/store`, and rolled up into conversion and revenue stats. The domain is
deliberately small so the *testing* is the thing you read.

## Run it

```bash
npm install
npm test              # builds, then runs all four levels
npm start             # http://127.0.0.1:3000
```

Each level runs on its own:

```bash
npm run test:unit
npm run test:integration
npm run test:smoke
npm run test:e2e      # builds first — it runs the real artifact

npm run db:up         # Postgres in Docker, needed only for the level below
npm run test:e2e:ui   # browser → UI → HTTP → Postgres
```

Measure the cost of each level on your own machine:

```bash
npm run bench:scale                              # 1000 tests per level, over 100 files
npm run bench:scale '[["e2e",20,50]]'            # or your own [level, files, tests-per-file]
```

## The four levels

| Level | What's real | How it's reached | Speed | A failure means |
|---|---|---|---|---|
| **Unit** | one function of ours | direct call | ~1ms | that function's logic is wrong |
| **Integration** | our code + the real engine and store | direct call | ~10ms | we're wired to the packages wrong |
| **Smoke** | the whole app, in-process | HTTP, ephemeral port | ~50ms | the app is fundamentally broken |
| **E2E (API)** | the built artifact, own process | HTTP, real port | ~1s | the shipped service doesn't work |
| **E2E (UI→DB)** | browser + artifact + Postgres | clicks in Chromium | ~4s | the shipped *product* doesn't work |

As you go down, confidence rises and diagnostic precision falls. A red unit test names
the broken function; a red E2E test only says *something* in the chain broke. So: many
unit tests, fewer integration, a couple of smoke, a handful of E2E.

### Unit — `tests/unit/`

Our own code, in isolation, no I/O and no third-party runtime.

`rates.ts` is pure arithmetic and `stats.ts` is a pure fold over plain objects. Neither
touches the engine or the store — `stats.test.ts` imports only the `StoredEvent` *type*
and builds those objects by hand. That's what keeps this level at a millisecond.

This is the only level where covering awkward edges is cheap, which is the whole point
of the `conversionRate` edge test — an empty cohort would divide `0/0` and yield `NaN`,
silently poisoning every rate downstream:

```ts
it('returns zero when the starting cohort is empty', () => {
  expect(conversionRate(0, 0)).toBe(0)
})
```

Push edge cases down to this level. Chasing that same one through HTTP would take a
hundred times longer and prove less about the arithmetic.

### Integration — `tests/integration/`

Our code wired to the **real** `EventEngine`, `EventStore` and `InMemoryAppendOnlyStore`.
Nothing is mocked.

This is the level people get wrong most often, so it's worth being precise about what it
tests. It does **not** test that `@eventengine/store` works — that's the package's own
job, and re-testing it here would only assert that someone else's code still does what it
did. What it tests is that **our** system is correctly wired to it: that emitting through
the engine reaches the store's recorder, that what lands in the log is the shape our
projection reads, and that `store.all()` feeds `projectFunnel` something it understands.

```ts
await funnel.engine.emit(leadCreated, { leadId: 'a' }, at)
expect(await funnel.stats()).toEqual({ leadsCreated: 1, /* … */ })
```

Every one of those seams is ours to get wrong, and none of them is visible to a unit test.

### Smoke — `tests/smoke/`

The whole app, in-process, over real HTTP — one shallow pass down the happy path.

Smoke tests are **wide and shallow**: they prove the pieces are connected, not that the
logic is right. `server.smoke.test.ts` posts one event and asks for the stats. It doesn't
check rates or revenue — the levels above already did. It only answers *"is this thing
plugged in?"*, catching an unregistered route or a funnel never handed to the server.

This is the level you run first in CI. Keep it fast and keep it few.

### E2E — `tests/e2e/`

The real built artifact, in its **own process**, reached only over the network.

`funnel.e2e.test.ts` runs `dist/index.js` — the compiled output you'd actually ship — as
a spawned child process, with a real port and a real `PORT` env var. The test shares no
memory with it and imports none of its source. It walks a full sales scenario and asserts
the exact stats payload.

Because it holds the app at arm's length, this level catches what nothing above it can: a
broken build, a bad entrypoint, an env var never read, a port never bound. Note that
`npm run test:e2e` builds first — an E2E test against a stale `dist/` is worse than no
test at all, because it passes.

What it does *not* touch: there is no browser and no database. It runs the service against
an in-memory store, so it proves the API works, not that the product does. That's the next
level.

### E2E, UI → DB — `tests/e2e-ui-db/`

The whole stack, for real: **Chromium** clicking a **rendered UI**, served by the **built
artifact** in its own process, writing to **Postgres** in a container.

```bash
docker compose up -d
npm run test:e2e:ui
```

Nothing here is simulated. The test selects from a `<select>`, fills an `<input>`, clicks a
`<button>`, and reads the rendered `<dd>` — the same things a person does. Then it opens an
independent connection to Postgres and checks the row actually landed:

```ts
await record('lead.created', 'a')
await expect.poll(() => page.textContent('#leadsCreated')).toBe('1')

const stored = await log.readFrom(null, 100)
expect(stored.rows.map((row) => row.name)).toEqual(['lead.created'])
```

That second assertion is the one that makes this level different from every other. The
levels above can all be satisfied by an app that never persists anything; this one cannot.

Two behaviors were confirmed by deliberately breaking things:

- Change the button's event listener from `click` to something else and **all three tests
  fail** — the browser is genuinely driving the UI, not calling the API behind its back.
- Start the app without `DATABASE_URL`, so it falls back to the in-memory store, and
  **only the persistence test fails**. The other two still pass, correctly: they assert
  what the user sees, which works fine without a database. That's each test asserting
  exactly what it claims to.

This level is gated behind its own script because it needs Docker and a ~100 MB Chromium
download. It is not part of `npm test`, and it shouldn't run on every push.

## Where a bug shows up

Every row below was **measured**, by introducing the bug and running all four suites:

| Break this | Unit | Integration | Smoke | E2E | UI→DB |
|---|:--:|:--:|:--:|:--:|:--:|
| `conversionRate` returns `NaN` on `0/0` | ✅ | — | — | — | — |
| Projection passes the rate args backwards | ✅ | ✅ | — | ✅ | ✅ |
| Store never registered with the engine | — | ✅ | ✅ | ✅ | ✅ |
| `/stats` route never registered | — | — | ✅ | ✅ | ✅ |
| `PORT` env var ignored | — | — | — | ✅ | ✅ |
| UI never renders the stats | — | — | — | — | ✅ |
| `DATABASE_URL` ignored — nothing persists | — | — | — | — | ✅ |

That staircase is the argument for keeping all four. Read it as a diagonal: cheap tests
catch narrow, deep bugs; expensive tests catch broad, structural ones.

Three rows are worth dwelling on:

- The `NaN` bug is caught by **the unit test alone**. No higher level trips on it, because
  none of them happens to project a funnel with zero leads. Coverage at the bottom is not
  implied by coverage at the top — a green E2E suite tells you nothing about the edges.
- The unregistered-store bug is caught by **everything except the unit tests**. It's a pure
  wiring mistake: every function involved is correct in isolation, and they're simply not
  connected. This is the class of bug that exists *because* we depend on a real package,
  and it is exactly what the integration level is for.
- The backwards-args bug is caught by integration and E2E but **not smoke**, which is the
  smoke level behaving correctly: it deliberately doesn't assert on rates.
- The last two rows are caught by **UI→DB alone**. Nothing below it renders a page or
  writes a row, so an app that displays stale numbers, or one that quietly forgets
  everything on restart, is invisible to all four cheaper levels. They are the reason the
  expensive level exists.

Try it yourself: break something in `src/` and watch which levels go red.

### A methodology bug worth admitting

The first version of this table said the API-level E2E caught the UI and persistence bugs.
It doesn't — that reading came from `vitest run tests/e2e`, which is a **substring** filter
and so also matched `tests/e2e-ui-db/`. The API suite was quietly running the UI suite, and
reporting 4 tests where it should have reported 1.

The scripts now use `tests/e2e/` with a trailing slash, and the UI level has its own config
file. It's the same lesson as the false greens below, one level up: a test command that
silently runs more than you think is as misleading as a test that silently asserts nothing.

## What each level costs

Measured on this repo, not estimated — `npm run bench:scale` generates real suites at
volume and times them (12 cores, vitest's default 11 workers).

| Level | Per extra test in an existing file | Per new test file (fixture) | **1000 tests over 100 files** |
|---|---|---|---|
| Unit | ~0.00 ms | 12.2 ms | **1.7 s** |
| Integration | 0.11 ms | 13.1 ms | **1.8 s** |
| Smoke | 0.32 ms | 19.9 ms | **2.5 s** |
| E2E (API) | 0.41 ms | 29.1 ms | **3.4 s** |
| E2E (UI→DB) | 18.5 ms | 49 ms | **20.0 s** |

Plus a one-time **1.1 s** for `docker compose up` to a healthy Postgres, paid once per run
rather than per file.

Which gives the model:

```
total ≈ harness startup + (files × fixture cost) + (tests × marginal cost)
        ─────────────────────────────────────────────────────────────────
                                parallelism
```

The thing worth internalizing: **tests are nearly free; fixtures are not.** 500 unit
tests in one file cost the same as one. What you pay for is each new file that boots a
server, spawns a process, or migrates a database. "This suite is slow" almost always
means "this suite has too many fixtures," not "too many tests."

### A projection this repo made, and then disproved

An earlier version of this README had no UI→DB level and *projected* what one would cost:
3 s per fixture, 500 ms per browser interaction, 4 parallel workers, giving **≈ 3.3 min**
for 1000 tests — about 120× the unit suite.

Then the level got built and measured, and it came in at **20 s** — roughly **10× cheaper
than projected**, and about 12× the unit suite rather than 120×. The projection was wrong
because:

- headless Chromium launches in ~200 ms, not seconds, and is reused across a file's tests;
- the Postgres container is a **one-time 1.1 s**, not a per-file cost;
- 11 browsers ran concurrently on this machine without contention, not 4.

The estimate was pessimistic by an order of magnitude, which is worth keeping visible: a
plausible cost model, built from plausible constants, was off by 10× until someone ran it.
Measure your own stack — `npm run bench:scale` exists for exactly that.

What *would* push a real suite back toward the original projection is everything this demo
doesn't have: a login flow before every test, a multi-second page load, per-test seed data,
a migration that isn't `CREATE TABLE IF NOT EXISTS`, and CI runners with 2 cores instead of
12. The shape of the model holds; the constants are always local.

## What a red test is worth at each level

Here is the same bug — rate arguments swapped — as reported by three levels:

```
unit         FAIL tests/unit/stats.test.ts > projectFunnel > derives the stage-to-stage conversion rates
integration  FAIL tests/integration/funnel.test.ts > a funnel wired to the engine and store > reports stats built from the events it recorded
e2e          FAIL tests/e2e/funnel.e2e.test.ts > the deployed funnel service > reports the funnel a sales team actually worked

  (all three)   - "qualificationRate": 0.5
                + "qualificationRate": 2
```

The assertion text is *identical*. The diagnostic difference isn't in the message at all —
it's in **how much ground the failure leaves you to search**:

| Level | The failure names | Code in scope |
|---|---|---|
| **Unit** | one function and one behavior of it | 32 lines of ours |
| **Integration** | a collaboration | 72 lines of ours + 383 of `@eventengine/*` |
| **Smoke** | an endpoint | 116 lines + packages + `node:http` |
| **E2E (API)** | the service | 126 lines + packages + `node:http` + build output + env |
| **E2E (UI→DB)** | the product | all of the above + browser + rendered DOM + Postgres |

A red unit test is a **diagnosis**. A red E2E test is a **symptom**.

This is why the levels are worth keeping together rather than picking one. When E2E goes
red and everything below stays green, that green is doing real work: it has eliminated
the logic and the wiring, so the bug is in the build, the transport, or the environment —
the only ground E2E covers alone. The staircase narrows the search.

## Tests define the feature

Run `npx vitest run --reporter=verbose` and the suite reads back as a specification:

```
conversionRate            returns the share of the starting cohort that advanced
conversionRate            returns zero when the starting cohort is empty
projectFunnel             counts each stage of the funnel
projectFunnel             derives the stage-to-stage conversion rates
projectFunnel             sums the revenue booked by won deals
dealWon                   carries the validated payload onto the event
dealWon                   refuses a deal booked for negative revenue
a funnel wired to …       reports stats built from the events it recorded
the funnel service        records an event and reports it in the stats
the funnel service        rejects a payload its schema refuses
the deployed service      reports the funnel a sales team actually worked
```

Every one of those sentences was written *before* the code it describes, and every one
was watched failing first. That ordering is what makes them expectations rather than
descriptions: a test written afterwards can only assert what the code already does, but a
test written first states what the code *must* do, and the code is then obliged to it.

The level decides *whose* expectation it is:

| Level | States an expectation about | Example from this repo |
|---|---|---|
| **Unit** | a function | "an empty cohort converts at zero" |
| **Integration** | a collaboration | "stats are built from the events we recorded" |
| **Smoke** | an interface | "a payload the schema refuses is rejected" |
| **E2E (API)** | the service | "a sales team's funnel is reported" |
| **E2E (UI→DB)** | the product | "the revenue a user booked through the form is shown, and persisted" |

Read bottom-up, that's a specification of the system. Read top-down, it's a feature
decomposed into the parts that must be true for it to hold. Both readings are useful, and
you get them for free by naming tests after behavior rather than after methods.

The corollary is the trap below: **a test you never watched fail isn't a specification,
it's a decoration.** It asserts nothing, and it will keep asserting nothing, quietly, for
as long as the repo lives.

## Two traps this repo ran into

Both are worth more than the passing tests, so they're recorded here.

**A test that never failed proves nothing.** The first version of the `dealWon` validation
test was `expect(() => dealWon.build(bad)).toThrow()` — and it passed before the event was
even written. `dealWon` was `undefined`, so `undefined.build()` threw a `TypeError`, and a
bare `.toThrow()` accepts *any* throw. It now asserts the specific error:

```ts
expect(() => dealWon.build({ leadId: 'a', amountCents: -1 }, at)).toThrowError(ZodError)
```

Always watch a test fail, and read *why* it failed.

**Don't test the dependency.** An earlier draft hand-rolled its own event store and unit
-tested `append`/`all`. Once the real `@eventengine/store` was in place, that test was
deleted rather than ported — the store's behavior belongs to the package. What survived is
the integration test that asserts *our wiring* to it.

## Layout

```
src/
  funnel/
    events.ts          defineEvent + zod schemas
    rates.ts           pure arithmetic                ← unit
    stats.ts           StoredEvent[] → FunnelStats    ← unit
    funnel.ts          engine + store wiring          ← integration
    postgres-store.ts  AppendOnlyStore over Postgres  ← integration
  ui.ts                the rendered page              ← e2e-ui-db
  server.ts            HTTP routes + UI               ← smoke
  index.ts             entrypoint, picks the store    ← e2e
tests/
  unit/  integration/  smoke/  e2e/  e2e-ui-db/
```

The store is chosen by environment, which is what keeps the cheap levels cheap:

```
DATABASE_URL set    → PostgresAppendOnlyStore   (e2e-ui-db)
DATABASE_URL unset  → InMemoryAppendOnlyStore   (everything else)
```

Both satisfy `AppendOnlyStore` from `@eventengine/ports`, so nothing above the port knows
which one it has. `npm test` runs the four fast levels and needs no Docker; the UI level is
opt-in via `npm run test:e2e:ui`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness check |
| `POST` | `/events` | emit a funnel event (`name` + payload) |
| `GET` | `/stats` | current funnel projection |

```bash
curl -X POST localhost:3000/events -d '{"name":"lead.created","leadId":"a"}'
curl -X POST localhost:3000/events -d '{"name":"deal.won","leadId":"a","amountCents":50000}'
curl localhost:3000/stats
```

Payloads are validated by the event's zod schema at emit time; an invalid one gets a `422`
and is never recorded.
