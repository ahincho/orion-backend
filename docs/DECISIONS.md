# ORION Backend - Decisions (ADRs)

This index lists the architectural decisions taken during the
`orion-backend` bootstrap. ADRs are **immutable records** of decisions
("why") and are independent of `docs/ARCHITECTURE.md` (which describes
the **current** shape). When a decision is superseded, the old ADR is
marked superseded but never rewritten.

## Format

Each ADR follows a [Nygard-style](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
template:

- **Status**: Proposed / Accepted / Superseded.
- **Deciders**: who owns the decision (current: `@ahincho`).
- **Context**: the problem we were solving.
- **Decision**: what we chose.
- **Consequences**: positive / negative trade-offs.

## Index

| # | Decision | Status |
|---|----------|--------|
| [0001](adr/0001-runtime-nodejs24-npm-workspaces.md) | Runtime: Node.js 24.x LTS + npm workspaces + TypeScript 5.7 strict | Accepted (2026-06-30) |
| [0002](adr/0002-sam-over-cdk.md) | IaC: AWS SAM for application, Terraform for infra (separate repo) | Accepted (2026-06-30) |
| [0003](adr/0003-httpapi-v2-vs-rest.md) | HTTP API v2 over REST API | Accepted (2026-06-30) |
| [0004](adr/0004-lambda-authorizer-request.md) | Lambda Authorizer (REQUEST) for custom JWT auth | Accepted (2026-06-30) |
| [0005](adr/0005-scrypt-builtin.md) | Password hashing: scrypt (Node built-in) over bcrypt/argon2 | Accepted (2026-07-19) |
| [0006](adr/0006-middy-v6-lambda-handler.md) | Middy v6 with custom `LambdaHandler` adapter wrapper | Accepted (2026-07-19) |
| [0007](adr/0007-postgres-aurora-serverless.md) | Persistence: Aurora Serverless v2 + kysely + node-pg-migrate | Accepted (2026-06-30) |
| [0008](adr/0008-eventbridge-as-bus.md) | Cross-context bus: EventBridge `orion-events-${env}` | Accepted (2026-06-30) |
| [0009](adr/0009-custom-jwt-no-cognito.md) | Auth: custom HS256 JWT + Secrets Manager (no Cognito) | Accepted (2026-06-30) |

## Superseded

- *(none yet)*

## How to add a new ADR

1. Pick the next number (`0010`).
2. Copy `docs/adr/NNNN-title.md` and follow the same template.
3. Add an entry to the index above with a one-line summary.
4. Open a PR against `main` with label `documentation`.
