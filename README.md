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
| **E2E** | the built artifact, own process | HTTP, real port | ~1s | the shipped thing doesn't work |

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

## Where a bug shows up

Every row below was **measured**, by introducing the bug and running all four suites:

| Break this | Unit | Integration | Smoke | E2E |
|---|:--:|:--:|:--:|:--:|
| `conversionRate` returns `NaN` on `0/0` | ✅ | — | — | — |
| Projection passes the rate args backwards | ✅ | ✅ | — | ✅ |
| Store never registered with the engine | — | ✅ | ✅ | ✅ |
| `/stats` route never registered | — | — | ✅ | ✅ |
| `PORT` env var ignored | — | — | — | ✅ |

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

Try it yourself: break something in `src/` and watch which levels go red.

## What each level costs

Measured on this repo, not estimated — `npm run bench:scale` generates real suites at
volume and times them (12 cores, vitest's default 11 workers).

**Adding one test to a file that already exists:**

| Level | Marginal cost per test |
|---|---|
| Unit | ~0.00 ms |
| Integration | 0.11 ms |
| Smoke | 0.32 ms |
| E2E | 0.41 ms |

**Adding one new test *file* — i.e. one new fixture:**

| Level | Cost per file |
|---|---|
| Unit | 12.2 ms |
| Integration | 13.1 ms |
| Smoke | 19.9 ms |
| E2E | 29.1 ms |

**1000 tests of each type, spread over 100 files:**

| Level | 1000 tests |
|---|---|
| Unit | 1.7 s |
| Integration | 1.8 s |
| Smoke | 2.5 s |
| E2E | 3.4 s |

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

### Why you should not take that 2× to your own codebase

Only a 2× spread between unit and E2E at 1000 tests is a suspiciously good result, and
it is an artifact of this demo. This app's E2E fixture is a Node process holding an
in-memory store — it boots in about 50 ms. A real E2E fixture is a browser, a database
with migrations, and a seeded auth session, and it usually can't run 11-wide because of
memory and port contention.

Substituting realistic figures into the same model — **a projection, not a measurement**,
at 3 s per fixture, 500 ms per test for real browser interaction, 4 parallel workers:

| | Fixture/file | Per test | Workers | 1000 tests over 100 files |
|---|---|---|---|---|
| Unit (measured here) | 12 ms | ~0 ms | 11 | **1.7 s** |
| E2E (measured here) | 29 ms | 0.41 ms | 11 | **3.4 s** |
| E2E (browser + DB) | 3 s | 500 ms | 4 | **≈ 3.3 min** |

That's roughly 120× the unit suite, and none of it comes from the tests — it comes from
the fixture and the interaction. The shape of the cost is the transferable lesson; the
constants are yours to measure. That's what the benchmark script is for.

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
| **E2E** | the product | 126 lines + packages + `node:http` + build output + env |

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
| **E2E** | the product | "a sales team's funnel is reported" |

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
    events.ts     defineEvent + zod schemas
    rates.ts      pure arithmetic                ← unit
    stats.ts      StoredEvent[] → FunnelStats    ← unit
    funnel.ts     engine + store wiring          ← integration
  server.ts       HTTP routes                    ← smoke
  index.ts        entrypoint                     ← e2e
tests/
  unit/  integration/  smoke/  e2e/
```

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
