# 0006 - Middy v6 with a custom LambdaHandler base wrapper

- Status: Accepted (2026-07-19, during PR #7 hardening)
- Deciders: @ahincho
- Supersedes: Middy v5 (which exposed `HandlerLambda`)

## Context and Problem Statement

`@middy/core` is the de-facto middleware framework for AWS Lambda in
TypeScript. v6 changed the public type shape: the `HandlerLambda`
generic alias that v5 exposed is gone, leaving `LambdaHandler` as the
expected base. The bootstrap initially used v5 idioms (passing `Handler`
+ extra context to `middy()`), which broke under `npm install` once
v6 was resolved. We need a stable handler shape that:

- Survives the v5 -> v6 (and future) migration without churn in every
  bounded context.
- Encodes our pipeline order:
  `header-normalize -> JSON-parse -> logger-inject -> X-Ray-capture ->
  auth-check -> CORS -> handler -> error-handler -> formatResponse`.
- Allows each business Lambda to be a thin wrapper around an inner
  closure that receives `(event, context, auth)`.

## Decision

We write a `buildHandler(config)` factory in `@orion/shared/templates`
that:

1. Returns a Lambda-compatible `Handler<...>` for AWS Lambda.
2. Internally runs a `middy()` pipeline whose **last** middleware is a
   custom `LambdaHandler`-shaped adapter (`Bridge` middleware) that
   invokes a typed `useCase(event, auth)` closure.
3. The useCase closure is the only thing each bounded context writes.
4. The pipeline can be configured to add/remove CORS, auth check, or
   logger-inject on a per-handler basis via a small config object.

Because `middy/http-cors@6` only accepts `string | string[]` for its
`getOrigin` parameter (sync), we resolve CORS dynamically on first
invocation: we cache the SSM-resolved whitelist once inside the
`buildHandler` closure (5-minute SSM cache lives in `@orion/shared`).

## Why this shape

- v6 of middy: the adapter middleware is the only stable surface we
  depend on (it's middleware -> pipeline ordering, not generics).
- One handler factory for the whole backend; each new bounded context
  only writes the `useCase` closure, never the middy setup.

## Consequences

### Positive

- Future-proof: the day a v7 of middy ships, only `Bridge` needs to
  adapt, not every Lambda.
- CORS resolution becomes async but cached, removing the "string or
  array only" constraint.
- TypeScript strict mode (`exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`) catches mismatches at compile time.

### Negative

- We carry a small dependency on a custom middleware that future
  maintainers must learn (mitigated by `buildHandler.test.ts` + the
  README in `@orion/shared`).
- The wrapper is opinionated; we cannot drop in a third-party middy
  pattern without re-wrapping. Documented as a constraint in
  `@orion/shared/README.md`.
