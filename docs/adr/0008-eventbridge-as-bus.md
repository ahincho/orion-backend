# 0008 - Amazon EventBridge as the cross-context bus

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

Bounded contexts must communicate without reaching into each other's
databases. We need a transport for domain events (not commands):
something that lets any context subscribe to "anything published in
context X" without taking a dependency on the publisher's stack.

## Decision

We use an **EventBridge bus** named
`orion-events-${Environment}` (e.g. `orion-events-dev`).

- **Per-event source:** `orion.<context>` (e.g. `orion.census`,
  `orion.identity`).
- **Detail type:** PascalCase past-tense (`CensusAssigned`,
  `UserRegistered`, `PasswordChanged`).
- **Detail payload (envelope):** `{ version: 1, data: { ... } }` so
  consumers can detect and refuse old-new mixes.
- **Publishers** use a single client in `@orion/shared/events`:
  - `publish(event)` -> single event with 3x exponential backoff and
    `FailedEntryCount === 0` assertion.
  - `publishMany(events)` -> chunks of 10, retry on
    `FailedEntryCount > 0`, partial-failure handling.
- **Consumers** in later phases are Lambda rules (Phase 2+); the
  bootstrap only publishes.

## Why EventBridge (not SNS / SQS / Kafka)

- EventBridge is the AWS-native way to model domain events (no shared
  queue, no consumer code in publisher).
- Cross-account support for free (in case `orion-cognitive-agent`
  consumes in another AWS account later).
- 24-hour retention + DLQ-able targets come built-in.
- SQS is a queue (each consumer needs its own queue + IAM); too low
  level for "domain events".
- Kafka is an operational tax we are not ready for in the bootstrap.

## Consequences

### Positive

- Publishers and subscribers are decoupled by design.
- Schema (the envelope `{ version, data }`) is a forward-compatible
  shape that lets consumers refuse unknown versions cleanly.
- Retention and replay are configurable.

### Negative

- EventBridge has a hard ceiling of 256 KB per event. We keep payloads
  small; the shared kernel enforces that.
- Local emulation of EventBridge is approximate; integration tests
  require a live AWS account.
- Schema registry (e.g. Glue Registry or AppSync) is **not** used yet,
  so event contracts live in this repo's Zod schemas (and will drift if
  not disciplined). Phase 2 ADR will revisit.
