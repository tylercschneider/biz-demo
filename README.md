# biz-demo

A TypeScript demo app that consumes the [`event-engine`](https://github.com/tylercschneider/event-engine)
packages and the [`the-local`](https://github.com/tylercschneider/the-local) provider
experts — the TS port of the Rails [`biz_demo`](../biz_demo) app.

It models a sales funnel — **lead created → lead qualified → deal won** — defining
events with `@event-engine/core`, recording and projecting them with
`@event-engine/store`, and rolling them up into conversion and revenue stats.
Because it depends on packages that ship `the-local` locals, opening it in Claude
Code surfaces resident experts (`core-*`, `store-*`) for the APIs it uses.

Setup is tracked in the issues.
