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
  - **Excepcion documentada**: el identificador de rol `promotor` se mantiene
    en espanol (es el unico role identifier que no sigue la convencion
    English). Razon: el equipo de producto lo prefiere asi para alinear
    con la terminologia usada por las cuadrillas en campo. Todos los
    demas identificadores (incluidos los demas roles, `asesor` → `advisor`,
    `distribuidor` → `promotor`, `admin` → `advisor`) son English.
- Commits: Conventional Commits + scope (`feat(auth): ...`).
- Tags: `git tag -a vX.Y.Z -m "release vX.Y.Z"` (semver).

## RBAC (3-tier)

El role de un usuario pertenece a exactamente uno de tres valores
(canonica y database-enforced via `CHECK` en `identity.users.role`):

| Nivel  | Identifier | Scope                                                                       |
| ------ | ---------- | --------------------------------------------------------------------------- |
| alto   | `advisor`  | CRUD completo sobre todos los usuarios (`/v1/users/*`)                      |
| medio  | `supervisor` | CRUD solo sobre usuarios `promotor`                                       |
| bajo   | `promotor` | sin acceso a endpoints administrativos                                      |

Reglas universales (aplican a todos los roles, incluido self):
- no se permite auto-deactivacion
- no se permite auto-cambio de rol
- solo se permite auto-cambio de password (`/v1/auth/change-password`)

Detalles en ADR 0010 (pendiente en Stage 3) y en `migrations/V009__restrict_user_role_to_advisor_supervisor_promotor.sql`.

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
- **Lambda Authorizer (REQUEST):** toda `AWS::Lambda::Permission` (en
  particular `AuthorizerFunctionPermission`) DEBE declarar
  `SourceArn` o `SourceAccount` apuntando al API Gateway / event
  source. Esta scoping evita cross-API confusion cuando varios HTTP
  APIs en la misma cuenta AWS comparten un Lambda authorizer. El CI
  job `lambda-permission-source-arn` (reusable workflow en
  `spark-match/spark-match-01-devops/.github/workflows/lambda-permission-source-arn.yml@main`,
  script Python stdlib en `spark-match-01-devops/scripts/check_lambda_permission_source_arn.py`)
  bloquea PRs que remuevan estos campos (incluso comentados).
  **cfn-nag 0.8.10 NO tiene regla equivalente** — sus únicas Lambda
  rules son W24 (action check) y F45 (eventSourceToken no plaintext).
  Rationale completo y la razón por la que la trust policy del role
  invocador está limitada al service principal (sin
  `aws:SourceAccount`/`aws:SourceArn`) están en [ADR 0007 de
  orion-infrastructure](https://github.com/ahincho/orion-infrastructure/blob/main/docs/adr/0007-api-gateway-authorizer-trust-policy.md).

## Antes de empezar a codear

1. Leer [README.md](README.md) para entender la arquitectura.
2. Revisar [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) cuando exista.
3. Consultar [docs/DECISIONS.md](docs/DECISIONS.md) (ADRs) para entender
   decisiones tomadas.
4. Crear rama `feat/<scope>` desde `main` actualizada.
5. Validar localmente: `npm run lint && npm run typecheck && npm test`.

## Contacto

- Owner: `@ahincho` (solo-dev).
