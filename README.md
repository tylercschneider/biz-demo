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
