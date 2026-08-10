# biz-demo

A small TypeScript sales-funnel service — **lead created → lead qualified → deal won** —
that exists to demonstrate the four levels of automated testing side by side:
**unit**, **integration**, **smoke**, and **end-to-end**.

The domain is deliberately tiny so the *testing* is the thing you read. Every level
tests the same funnel; what changes is how much of the system is real, how the test
reaches it, and what a failure tells you.

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
| **Unit** | One function | Direct call | ~1ms | That function's logic is wrong |
| **Integration** | Several units together | Direct call | ~5ms | The units disagree at their seam |
| **Smoke** | The whole app in-process | HTTP, ephemeral port | ~50ms | The app is fundamentally broken |
| **E2E** | The built artifact, own process | HTTP, real port | ~1s | The shipped thing doesn't work |

The progression is a trade. As you go down, confidence rises and diagnostic precision
falls. A red unit test names the broken function; a red E2E test only says *something*
in the chain broke. So: many unit tests, fewer integration, a couple of smoke, a
handful of E2E.

### Unit — `tests/unit/`

One function, in isolation, no collaborators and no I/O.

`conversionRate` is pure arithmetic, so its tests are about *logic*, and this is the
only level where covering the awkward edges is cheap. That's the point of the second
test — an empty cohort would divide `0/0` and yield `NaN`, which would silently
poison every rate downstream:

```ts
it('returns zero when the starting cohort is empty', () => {
  expect(conversionRate(0, 0)).toBe(0)
})
```

Chasing that same edge through an HTTP request would take a hundred times longer and
prove less about the arithmetic. Push edge cases down to this level.

### Integration — `tests/integration/`

Several real units wired together, checked at their **seam**.

`projection.test.ts` drives a real `EventStore` and the real `projectFunnel`, which
in turn calls the real `conversionRate`. Nothing is mocked. Each piece already passes
its own unit tests — what's under test here is whether they agree with each other:
that the projection reads the store's event shape correctly, and feeds
`conversionRate` its arguments in the right order.

That last one is the bug this level exists to catch. `conversionRate(qualified,
created)` is just as green at the unit level and completely wrong here.

### Smoke — `tests/smoke/`

The whole app, in-process, over real HTTP — one shallow pass down the happy path.

Smoke tests are **wide and shallow**: they prove the pieces are connected, not that
the logic is right. `server.smoke.test.ts` posts one event and asks for the stats. It
doesn't check rates or revenue — the levels above already did. It only answers
*"is this thing plugged in?"*, catching an unregistered route or a projection never
wired to the store.

This is the level you run first in CI, and the one that fails when a deploy is
fundamentally broken. Keep it fast and keep it few.

### E2E — `tests/e2e/`

The real built artifact, in its **own process**, reached only over the network.

`funnel.e2e.test.ts` runs `dist/index.js` — the compiled output you'd actually ship —
as a spawned child process, with a real port and a real `PORT` env var. The test
shares no memory with it and imports none of its source. It walks a full sales
scenario and asserts the exact stats payload.

Because it holds the app at arm's length, this level catches what nothing above it
can: a broken build, a bad entrypoint, an env var never read, a port never bound.
Note that `npm run test:e2e` builds first — an E2E test against a stale `dist/`
is worse than no test at all, because it passes.

## Where a bug shows up

The levels aren't redundant — each one catches a class the others can't see:

| Break this | Unit | Integration | Smoke | E2E |
|---|:--:|:--:|:--:|:--:|
| `conversionRate` returns `NaN` on `0/0` | ✅ | — | — | — |
| Projection passes the rate args backwards | — | ✅ | — | ✅ |
| `/stats` route never registered | — | — | ✅ | ✅ |
| `PORT` env var ignored | — | — | — | ✅ |

Read it as a diagonal: the cheap tests catch narrow, deep bugs, and the expensive
tests catch broad, structural ones. You need both — but you want far more of the
cheap ones.

Two rows are worth dwelling on, because both were measured by actually introducing
the bug and running all four levels:

- The `NaN` bug is caught by **the unit test alone**. No higher level trips on it,
  because none of them happens to project a funnel with zero leads. Coverage at the
  bottom is not implied by coverage at the top — a passing E2E suite tells you
  nothing about the edges.
- The backwards-args bug is caught by **integration and E2E but not smoke**, which
  is the smoke level behaving correctly: it deliberately doesn't assert on rates.

Try it yourself: break something in `src/` and watch which levels go red.

## Layout

```
src/
  funnel/
    events.ts       domain event types
    rates.ts        pure arithmetic          ← unit
    store.ts        in-memory event store
    projection.ts   events → FunnelStats     ← integration
  server.ts         HTTP routes              ← smoke
  index.ts          entrypoint               ← e2e
tests/
  unit/  integration/  smoke/  e2e/
```

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | liveness check |
| `POST` | `/events` | append a funnel event |
| `GET` | `/stats` | current funnel projection |

```bash
curl -X POST localhost:3000/events -d '{"type":"lead_created","leadId":"a"}'
curl localhost:3000/stats
```

## Note on scope

The original sketch for this repo consumed the `@event-engine/*` packages. Those
aren't published or available locally, so the event store and projection here are
implemented in-repo with no external dependencies — the testing levels are the
subject, and a self-contained app makes them easier to read. The `event-engine`
integration remains open in the issue backlog.
