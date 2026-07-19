# AGENTS.md

> Convenciones operacionales para el repo `orion-backend`. Lectura obligatoria
> antes de cada PR.

---

## Proyecto

**ORION - Sistema Cognitivo**. Repositorio parte de un monorepo de 5
repositorios coordinados (`orion-frontend`, `orion-backend`,
`orion-cognitive-agent`, `orion-article`, `orion-infrastructure`).

Este repo contiene: **backend service (API) en sprint** — serverless DDD+EDA
monolith sobre AWS Lambda + TypeScript + PostgreSQL.

## Stack (referencia rápida)

- **Runtime:** Node.js 24.x (LTS Krypton).
- **Language:** TypeScript 5.7 strict mode (`noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`).
- **Compute:** AWS Lambda (1 por caso de uso).
- **API:** HTTP API v2 + Lambda Authorizer (REQUEST, valida JWTs HS256).
- **Persistence:** PostgreSQL via kysely + node-postgres.
- **Migrations:** `node-pg-migrate` v9 (Flyway-style `V<version>__<name>.sql`,
  tabla de tracking `orion_migrations` en schema `public`).
- **Eventing:** Amazon EventBridge (custom bus `orion-events-${Environment}`,
  source events `orion.<context>`).
- **Observabilidad:** AWS Powertools (Logger + Tracer + Metrics EMF) +
  X-Ray (`Tracing: Active`).
- **Auth:** JWTs firmados con HS256 + secret en Secrets Manager. Lambda
  Authorizer dedicado en `contexts/authorizer/`. **NO Cognito** — user
  management propio en `contexts/identity/`.
- **CORS:** whitelist dinámica desde SSM `/orion/cors/allowed-origins`.

## Git Workflow (mandatory)

Single-tier branching (rapid solo project). Validar siempre que la
cuenta activa sea `ahincho`:

```
gh api user --jq .login
```

- `main` es la unica branch permanente. PRs van contra `main` directamente.
- Todo trabajo ocurre en una feature branch: `feat/`, `fix/`, `chore/`,
  `docs/`, `ci/`, etc.

### Lifecycle de cada cambio

1. `git fetch origin && git checkout main && git pull --ff-only origin main`.
2. `git checkout -b <type>/<scope>` desde `main`.
3. Implementar, commitear con Conventional Commits (`feat:`, `fix:`,
   `chore:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`).
4. `git push -u origin <type>/<scope>`.
5. Abrir PR **desde `<type>/<scope>` a `main`**.
6. Asignar a `@ahincho` + labels existentes (nunca crear nuevas).
7. Tras CI verde, **squash-merge a `main`**.
8. Branch borrada automaticamente por el ruleset.

### Forbidden

- Commit directo a `main` (forzado por ruleset).
- Force-push a `main` (forzado por ruleset non_fast_forward).
- Merge commits en `main` (squash-only habilitado).
- Crear labels nuevas en issues/PRs — usar `gh label list` para revisar las
  existentes y mapear según significado (area:backend, enhancement, bug,
  security, dependencies, breaking-change, priority:*).

## Convenciones de codigo

- Routing/nombres/identificadores en **English**; copy de UI en **Spanish**
  (solo aplica a orion-frontend).
- Commits: Conventional Commits + scope (`feat(auth): ...`).
- Tags: `git tag -a vX.Y.Z -m "release vX.Y.Z"` (semver).

## Estructura por bounded context

Cada `contexts/<name>/` sigue el layout:

```
contexts/<name>/
├── package.json           # @orion/context-<name>
├── tsconfig.json          # extends ../../tsconfig.base.json
├── template.yaml          # nested SAM stack (1+ Lambdas)
├── src/
│   ├── composition.ts     # Composition root (DI manual, lazy singleton)
│   ├── domain/            # Plain TS interfaces + Zod event schemas
│   ├── service/           # Application service (closure factory)
│   ├── infra/             # kysely repos + DB connection
│   ├── schemas/           # Zod request/response schemas
│   └── handlers/          # Thin wrappers around buildHandler()
└── tests/
    └── *.test.ts          # Vitest unit tests (mocks, no DB)
```

## Migraciones

- Ubicación: `migrations/` (raíz del repo).
- Naming: `V<version>__<name>.sql` (Flyway-style).
- Tracking: tabla `orion_migrations` en schema `public`.
- Comandos: `npm run migrate:create -- V<version>__<name>`, `migrate:up`,
  `migrate:down`, `migrate:redo`.
- Schema por bounded context: `census`, `networks`, `risk`, `postsale`,
  `identity`. Cada schema vive bajo `public`.

## Convenciones AWS

- **Region:** `us-east-1` (default).
- **Naming:** `orion-<componente>-<env>`.
- **Env vars de runtime:** sourced de SSM via `{{resolve:ssm:/orion/...}}`
  (Terraform en `orion-infrastructure` es la fuente de verdad de los ARNs).
- **Tracing:** `Tracing: Active` en todas las Lambdas.
- **Powertools service name:** `orion-backend-${Environment}`.
- **Tags:** aplicados via `default_tags` en `template.yaml` (Phase 1+).

## Antes de empezar a codear

1. Leer [README.md](README.md) para entender la arquitectura.
2. Revisar [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) cuando exista.
3. Consultar [docs/DECISIONS.md](docs/DECISIONS.md) (ADRs) para entender
   decisiones tomadas.
4. Crear rama `feat/<scope>` desde `main` actualizada.
5. Validar localmente: `npm run lint && npm run typecheck && npm test`.

## Contacto

- Owner: `@ahincho` (solo-dev).
