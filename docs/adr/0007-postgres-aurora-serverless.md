# 0007 - PostgreSQL on Aurora Serverless v2 with kysely + node-pg-migrate

- Status: Accepted (2026-06-30, during repo bootstrap)
- Deciders: @ahincho
- Supersedes: -

## Context and Problem Statement

The persistence layer must support:

- A schema per bounded context (`identity`, `census`, `networks`, `risk`,
  `postsale`, all under `public`).
- Forward-only schema migrations on deploy.
- Type-safe query building in TypeScript.
- Cheap idle cost (the bootstrap is a single environment in a single
  region and traffic is bursty).

Options:

- **RDS PostgreSQL (provisioned):** predictable cost, but idle cost
  is high for a bootstrap project.
- **Aurora Serverless v2:** ACU auto-scaling, pay-per-second; cheaper
  on idle but cold-start on first query is ~10s.
- **DynamoDB:** not PostgreSQL; would change the API shape downstream.
- **PlanetScale / Neon:** third-party; outside the AWS boundary we
  otherwise work in.

## Decision

- **Engine:** Aurora Serverless v2 PostgreSQL 14+.
- **Driver:** `pg` (node-postgres) for the connection pool, behind
  `kysely` for typed query construction.
- **Migrations:** `node-pg-migrate` v9 with
  `migrationsTable: 'orion_migrations'`, `migrationsSchema: 'public'`,
  Flyway-style names `V<version>__<name>.sql`, tracked in
  `public.orion_migrations`.
- **Per-context schema:** every bounded context owns its schema;
  tables cross-reference with explicit FK constraints declared in the
  later context's migrations (e.g. `census.homes.assigned_user_id` ->
  `identity.users.id`).
- **Transactional writes** (`db.transaction().execute(async trx => ...)`)
  for multi-step writes in Phase 2+.

## Why Aurora Serverless v2 (not RDS provisioned)

- Pay-per-second ACU aligns with the bootstrap's bursty traffic.
- v2 has faster cold-start than v1 (the latter had a 30 s pause).
- Shared with other AWS services via VPC peering, no external network.

## Why kysely (not raw SQL or Prisma)

- `kysely` is a typed query builder that holds the table interface as
  a TS module (`Database` type). It returns plain rows, which keeps
  handlers free of ORM-specific quirks.
- No `prisma generate` step in CI; builds are pure `tsc -b`.
- Migrating to a different store later means rewriting the
  `Database` interface and the repository classes, NOT touching
  handlers.

## Why node-pg-migrate

- Plain-SQL migration files (no JS migration boilerplate to keep).
- `--use-glob` (npm v9+) accepts `V*.sql` automatically.
- Tracks applied migrations in a single table; roll-forward is
  trivial, roll-back requires a deliberate
  `migrate:down`.

## Consequences

### Positive

- Cheapest reliable Postgres at low traffic.
- Schema-per-context keeps the bounded contexts independent at the
  database layer.
- kysely + `pg` is fully synchronous-style for our simple repositories.
- Migration history is plain SQL; reviewers see the change directly.

### Negative

- Aurora v2 pauses on idle; first request after a long idle wait pays
  the cold-start (~5-10 s). Acceptable for bootstrap traffic, will be
  measured in Phase 2+ and may switch to a fixed-capacity Aurora if
  it hurts UX.
- node-pg-migrate doesn't do declarative diff (Prisma-style); we
  accumulate `.sql` over time and prune old migrations when
  convenient.
