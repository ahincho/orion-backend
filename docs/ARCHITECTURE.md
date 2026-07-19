# =============================================================================
# ORION Backend - Architecture
# =============================================================================
# High-level design for the serverless DDD+EDA backend.
# =============================================================================

## Overview

ORION backend is a **serverless DDD+EDA monolith** running on AWS Lambda.
Each bounded context owns its database schema and exposes its operations
as a set of Lambda functions, each bound to one HTTP API v2 route. Cross-
context communication happens exclusively through Amazon EventBridge.

```
┌──────────────────────────────────────────────────────────────────┐
│  HTTP API v2 (REST-style, JWT validated by Lambda Authorizer)    │
└────┬──────────────┬──────────────┬──────────────┬───────────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  ← TypeScript Lambdas
│Identity │   │ Census  │   │Networks │   │  Risk   │     (1 per use case)
│  (auth) │   │  (P1)   │   │  (P2)   │   │  (P3)   │
└────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
     │             │              │              │
     ▼             ▼              ▼              ▼
┌──────────────────────────────────────────────────────┐
│  EventBridge bus (orion-events-${Environment})       │  ← EDA backbone
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ PostgreSQL (Aurora Serverless v2) — managed in orion-infrastructure
│   schemas: identity, census, networks, risk, postsale, public
└──────────────────────────────────────────────────────┘
```

## Layered architecture (within each bounded context)

```
handlers/        ← Lambda entry points (thin, ~15 lines each)
   │ depends on
   ▼
service/         ← Application service (closure factory, no class)
   │ depends on
   ▼
infra/           ← Kysely repositories + DB connection
   │ depends on
   ▼
domain/          ← Plain TS interfaces + Zod event schemas
                    (zero dependencies on infra or service)
```

**Dependency rule:** arrows only point downward. `domain/` never imports
from `service/`, `infra/`, or `handlers/`. The composition root
(`composition.ts`) wires everything together via a lazy singleton pattern.

## Composition root (DI)

Each context has a `composition.ts` that exposes `buildContext()` — a
promise-guarded lazy singleton:

```ts
let ctx: CensusContext | null = null;
let pending: Promise<CensusContext> | null = null;

export async function buildContext(): Promise<CensusContext> {
  if (ctx) return ctx;
  if (pending) return pending;
  pending = (async () => {
    const db = await getDbConnection();
    const repo = createCensusRepository(db);
    const publisher = createEventBridgeClient({ busArn });
    const service = createCensusService({ repo, publisher });
    ctx = { service };
    return ctx;
  })();
  return pending;
}
```

This survives Lambda warm starts (cached on `ctx`) without leaking
connections on cold paths.

## Shared kernel

`shared/` is an npm workspace (`@orion/shared`) that provides:

- **auth**: `requireAuth(event)` middleware, `AuthContext` type, JWT helpers
  (sign/verify via `jose`).
- **http**: `ApiError` class hierarchy (badRequest/unauthorized/forbidden/
  notFound/conflict/internal), `formatResponse()`, `formatError()`.
- **events**: `createEventBridgeClient()` with retry (exponential backoff,
  `FailedEntryCount` check, partial-failure handling for `publishMany`).
- **infra**: `createSsmReader()` (5-min cache), `createSecretsReader()`
  (5-min cache).
- **logger**: `createLogger(serviceName)` wrapper over Powertools Logger.
- **cors**: `getCorsOrigins()` reads whitelist from SSM
  `/orion/cors/allowed-origins`.
- **templates**: `buildHandler(config)` Middy pipeline (header normalize →
  JSON parse → log inject → X-Ray capture → auth check → error handler →
  CORS).

## Lambda Authorizer (custom JWT)

We do **not use Cognito**. Authentication is implemented in
`contexts/identity/` (users table in PostgreSQL, **scrypt**-hashed
passwords with `N=16384, r=8, p=1`, JWT signed with HS256). All
protected routes are gated by a single **Lambda Authorizer**
(`contexts/authorizer/`) that:

1. Reads `Authorization: Bearer <jwt>` header.
2. Verifies signature using secret from Secrets Manager
   (`/orion/secret/jwt-arn`).
3. Validates `exp`, `iat`, `nbf`.
4. Returns `{ isAuthorized: true, context: { userId, email, role } }`.
5. API Gateway attaches context to `event.requestContext.authorizer.lambda`.

The `requireAuth` middleware in `buildHandler()` reads this context and
throws `ApiError.unauthorized()` if missing.

## CQRS

CQRS is implemented **implicitly** via fine-grained Lambdas (1 per use
case). Commands are handlers that mutate state (e.g. `POST /v1/census/
assignments`) and queries are handlers that read (`GET /v1/census/
homes`). The split is enforced by:
- Naming convention (`*-create`, `*-update`, `*-delete` vs `*-list`,
  `*-get`).
- Separate Zod schemas (`inputSchema` for command bodies, query params
  parsed separately).
- Event publication only in command handlers (read events are not
  emitted; analytics derives them from state).

## Persistence

- **Engine:** PostgreSQL 14+ (Aurora Serverless v2 in production).
- **Driver:** `pg` (node-postgres) with `kysely` for typed query building.
- **Migrations:** `node-pg-migrate` v9 with Flyway-style naming
  (`V<version>__<name>.sql`), tracking table `orion_migrations` in schema
  `public`.
- **Schemas:** one per bounded context (`identity`, `census`, `networks`,
  `risk`, `postsale`). All under `public`.
- **Transactions:** `db.transaction().execute(async trx => ...)` for
  multi-step writes (Phase 2+).

## Eventing (EDA)

- **Bus:** `orion-events-${Environment}` (custom bus, not the default).
- **Source naming:** `orion.<context>` (e.g. `orion.census`,
  `orion.identity`).
- **Detail-type:** PascalCase past-tense (`CensusAssigned`,
  `NetworkExpanded`, `MaintenanceScheduled`).
- **Detail payload:** `{ version: 1, data: { ... } }` for forward
  compatibility.
- **Publishing:** `publish(event)` (single, retry 3x backoff) for
  critical events; `publishMany(events)` (chunked 10/batch, retry +
  `FailedEntryCount` check) for non-critical fan-out.
- **Catalog:** [EVENT_CATALOG.md](EVENT_CATALOG.md) (TBD Phase 1).

## Observability

- **Logs:** AWS Powertools Logger (JSON, auto-injected `correlationId`,
  `xRayTraceId`, `lambdaContext.requestId`).
- **Tracing:** X-Ray via Powertools Tracer; `Tracing: Active` on every
  Lambda.
- **Metrics:** Powertools Metrics (EMF, no PutMetricData API calls) — added
  Phase 2+.
- **Dashboards:** CloudWatch (Phase 4+).

## Cross-repo integration

- **orion-frontend** (Angular 22): consumes the HTTP API v2 endpoints.
  Sends JWTs in `Authorization: Bearer <token>` header.
- **orion-cognitive-agent** (Bedrock / AgentCore): publishes cognitive
  recommendations via EventBridge; subscribes to domain events for
  context.
- **orion-infrastructure** (Terraform): provisions VPC, RDS Aurora,
  EventBridge bus, Secrets Manager, IAM roles, SSM parameters.
- **orion-article** (LaTeX report): read-only references to ORION docs.

## Roadmap

See [DECISIONS.md](DECISIONS.md) for ADRs and [README.md](../README.md)
for phase status.
