# ORION Backend

Serverless DDD+EDA monolith for ORION (Pequeño Sistema Cognitivo). Lambdas on AWS
with TypeScript + PostgreSQL, orchestrated via AWS SAM and shared via npm
workspaces.

> **Owner:** `@ahincho` (solo-dev).
> **Repo:** [ahincho/orion-backend](https://github.com/ahincho/orion-backend)
> **Stack:** Node 24 (LTS Krypton), TypeScript 5.7, AWS SAM, Lambda, kysely+pg, EventBridge, Middy, Zod, Powertools.

---

## Quick links

- **Architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Event catalog**: (TBD Phase 1)
- **Folder structure**: [docs/FOLDER_STRUCTURE.md](docs/FOLDER_STRUCTURE.md)
- **Operational conventions**: [AGENTS.md](AGENTS.md)

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 24.x (LTS Krypton, EOL Apr 2028) |
| Language | TypeScript 5.7 (strict mode) |
| Compute | AWS Lambda (1 per use case) |
| API | HTTP API v2 + Lambda Authorizer (REQUEST) |
| Persistence | PostgreSQL via kysely + node-postgres |
| Migrations | node-pg-migrate v9 (Flyway-style `V<version>__<name>.sql`) |
| Eventing | Amazon EventBridge (custom bus `orion-events-${Environment}`) |
| Validation | Zod (schemas next to domain) |
| Logging | AWS Powertools Logger |
| Tracing | AWS X-Ray (via Powertools Tracer) |
| Layers | 2 Lambda Layers: `orion-node-shared` (compiled shared/) + `orion-node-runtime` (deps) |
| Testing | Vitest + v8 coverage |
| Linting | ESLint (flat config) + Prettier |
| IaC | AWS SAM (Lambdas + HTTP API) + Terraform in `orion-infrastructure` (VPC, RDS, IAM, EventBridge bus, Cognito alternatives) |

---

## Folder structure

```
orion-backend/
├── package.json              # npm workspaces root (@orion/backend)
├── tsconfig.base.json        # strict TS config shared by all workspaces
├── template.yaml             # SAM root orchestrator (HttpApi + 2 Layers + nested stacks)
├── samconfig.toml            # per-env SAM config (default=dev, prod)
├── vitest.config.mts         # Vitest + v8 coverage (thresholds 70/70/60/70)
├── eslint.config.mjs         # ESLint flat config (TypeScript strict)
├── .prettierrc
│
├── shared/                   # @orion/shared (npm workspace)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── auth/             # requireAuth, AuthContext, JWT helpers
│       ├── http/             # ApiError, formatResponse, formatError
│       ├── events/           # eventbridge-client (with retry), schema-validator
│       ├── infra/            # ssm-reader, secrets-reader
│       ├── logger/           # powertools-logger wrapper
│       ├── cors/             # CORS origins from SSM
│       ├── templates/        # buildHandler() Middy pipeline
│       └── index.ts
│
├── layers/                   # Lambda Layers
│   ├── node-shared/          # compiled @orion/shared (build.sh)
│   └── node-runtime/         # jose, zod, middy, powertools, kysely, pg (build.sh)
│
├── contexts/                 # Bounded Contexts (one nested SAM stack each)
│   ├── authorizer/           # Lambda Authorizer (validates JWT)
│   ├── identity/             # users, sessions, login, register
│   ├── census/               # P1: Asignación de Censos
│   ├── networks/             # P2: Expansión de Redes
│   ├── risk/                 # P3: Mantenimiento por Riesgo
│   └── postsale/             # P4: Seguimiento Post-Venta
│
├── migrations/               # node-pg-migrate (Flyway-style: V<version>__<name>.sql)
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md          # ADRs
│   ├── EVENT_CATALOG.md
│   └── FOLDER_STRUCTURE.md
│
├── tests/                    # cross-cutting tests
│   └── setup.ts
│
└── .github/
    ├── CODEOWNERS
    ├── pull_request_template.md
    └── workflows/
        ├── ci.yml            # lint + typecheck + test (calls spark-match-01-devops reusable)
        └── deploy.yml        # SAM build + deploy via OIDC
```

---

## Local development

### Prerequisites

- Node.js 24+ (`node --version`)
- npm 11+ (`npm --version`)
- AWS SAM CLI 1.151+ (`sam --version`)
- AWS CLI configured (for `sam local` / deploy)
- PostgreSQL 14+ (for migrations)

### Install

```bash
npm install
npm run build:shared
```

### Test

```bash
npm test                  # all unit tests
npm run test:watch        # watch mode
npm run test:coverage     # with coverage report
```

### Lint + Typecheck

```bash
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit (strict)
npm run format            # Prettier --write
```

### Build Lambda Layers

```bash
npm run layer:build:all   # builds shared + runtime layers
```

### Local development

```bash
# In one terminal: start API Gateway + Lambda emulators
npm run local:api

# In another: invoke a specific function
sam local invoke IdentityRegisterFunction -e events/register.json
```

### Migrations

```bash
# Create a new migration (semantic version, e.g. V001, V002)
npm run migrate:create -- V001__create_schema_identity

# Apply pending migrations
npm run migrate:up

# Roll back the last migration
npm run migrate:down

# Re-apply the last migration
npm run migrate:redo
```

### Deploy

```bash
sam build && sam deploy                  # dev (default)
sam build && sam deploy --config-env prod
```

---

## Status (Phase 0 — bootstrap)

| Phase | Scope | Status |
|---|---|---|
| **0** | **Scaffold base (package, tsconfig, SAM, workflows, lint)** | **🚧 In progress** |
| 1 | Shared kernel (`@orion/shared`) + Lambda Layers | ⏳ |
| 2 | Authorizer + Identity contexts (login/register) | ⏳ |
| 3 | First pillar (`census`) with migrations V001..V00N | ⏳ |
| 4 | Other pillars (`networks`, `risk`, `postsale`) | ⏳ |
| 5 | Integration tests (testcontainers for Postgres) | ⏳ |

---

## License

MIT — see [LICENSE](LICENSE).
