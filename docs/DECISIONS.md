# ORION Backend - Decisiones (ADRs)

Este índice lista las decisiones arquitectónicas tomadas durante el
bootstrap de `orion-backend`. Los ADRs son **registros inmutables** de
decisiones ("por qué") y son independientes de `docs/ARCHITECTURE.md`
(que describe la **forma actual**). Cuando una decisión es reemplazada,
el ADR viejo se marca como superseded pero nunca se reescribe.

## Formato

Cada ADR sigue el template
[Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

- **Status**: Propuesto / Aceptado / Superseded.
- **Deciders**: quién es dueño de la decisión (actual: `@ahincho`).
- **Contexto**: el problema que estábamos resolviendo.
- **Decisión**: lo que elegimos.
- **Consecuencias**: trade-offs positivos / negativos.

## Índice

| # | Decisión | Estado |
|---|----------|--------|
| [0001](adr/0001-runtime-nodejs24-npm-workspaces.md) | Runtime: Node.js 24.x LTS + npm workspaces + TypeScript 5.7 strict | Aceptado (2026-06-30) |
| [0002](adr/0002-sam-over-cdk.md) | IaC: AWS SAM para aplicación, Terraform para infra (repo separado) | Aceptado (2026-06-30) |
| [0003](adr/0003-httpapi-v2-vs-rest.md) | HTTP API v2 sobre REST API | Aceptado (2026-06-30) |
| [0004](adr/0004-lambda-authorizer-request.md) | Lambda Authorizer (REQUEST) para auth JWT custom | Aceptado (2026-06-30) |
| [0005](adr/0005-scrypt-builtin.md) | Hash de contraseñas: scrypt (built-in de Node) sobre bcrypt/argon2 | Aceptado (2026-07-19) |
| [0006](adr/0006-middy-v6-lambda-handler.md) | Middy v6 con wrapper adaptador `LambdaHandler` propio | Aceptado (2026-07-19) |
| [0007](adr/0007-postgres-aurora-serverless.md) | Persistencia: Aurora Serverless v2 + kysely + node-pg-migrate | Aceptado (2026-06-30) |
| [0008](adr/0008-eventbridge-as-bus.md) | Bus entre contextos: EventBridge `orion-events-${env}` | Aceptado (2026-06-30) |
| [0009](adr/0009-custom-jwt-no-cognito.md) | Auth: JWT HS256 custom + Secrets Manager (sin Cognito) | Aceptado (2026-06-30) |
| [0010](adr/0010-user-management.md) | Gestión de usuarios: RBAC 3-tier (advisor/supervisor/agent) + 5 endpoints administrativos | Aceptado (2026-07-22) |

## Superseded

- *(ninguno por ahora)*

## Cómo agregar un nuevo ADR

1. Elegir el próximo número (`0011`).
2. Copiar `docs/adr/NNNN-titulo.md` y seguir el mismo template.
3. Agregar una entrada al índice de arriba con un resumen de una línea.
4. Abrir un PR contra `main` con label `documentation`.
