# =============================================================================
# ORION Backend - Arquitectura
# =============================================================================
# Diseño de alto nivel para el monolito serverless DDD+EDA.
# =============================================================================

## Visión general

El backend ORION es un **monolito serverless DDD+EDA** corriendo sobre AWS
Lambda. Cada bounded context posee su propio esquema de base de datos y
expone sus operaciones como un conjunto de funciones Lambda, cada una
asociada a una ruta HTTP API v2. La comunicación entre contextos ocurre
exclusivamente a través de Amazon EventBridge.

```
┌──────────────────────────────────────────────────────────────────┐
│  HTTP API v2 (estilo REST, JWT validado por Lambda Authorizer)    │
└────┬──────────────┬──────────────┬──────────────┬───────────────┘
     │              │              │              │
     ▼              ▼              ▼              ▼
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐  ← Lambdas TypeScript
│Identity │   │ Census  │   │Networks │   │  Risk   │     (1 por caso de uso)
│  (auth) │   │  (P1)   │   │  (P2)   │   │  (P3)   │
└────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
     │             │              │              │
     ▼             ▼              ▼              ▼
┌──────────────────────────────────────────────────────┐
│  Bus EventBridge (orion-events-${Environment})       │  ← backbone EDA
└────┬─────────────────────────────────────────────────┘
     │
     ▼
┌─────────────────────────────┐
│ PostgreSQL (Aurora Serverless v2) — gestionado en orion-infrastructure
│   schemas: identity, census, networks, risk, postsale, public
└──────────────────────────────────────────────────────┘
```

## Arquitectura en capas (dentro de cada bounded context)

```
handlers/        ← puntos de entrada Lambda (delgados, ~15 líneas cada uno)
   │ depende de
   ▼
service/         ← servicio de aplicación (factory por closure, sin clase)
   │ depende de
   ▼
infra/           ← repositorios Kysely + conexión a DB
   │ depende de
   ▼
domain/          ← interfaces planas en TS + schemas Zod de eventos
                    (cero dependencias sobre infra o service)
```

**Regla de dependencia:** las flechas solo apuntan hacia abajo.
`domain/` nunca importa desde `service/`, `infra/` ni `handlers/`. El
composition root (`composition.ts`) cablea todo mediante un patrón de
singleton perezoso con promesa guardada.

## Composition root (DI)

Cada contexto tiene un `composition.ts` que expone `buildContext()` — un
singleton perezoso protegido por promesa:

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

Esto sobrevive los warm starts de Lambda (cacheado en `ctx`) sin
perder conexiones en cold paths.

## Shared kernel

`shared/` es un workspace de npm (`@orion/shared`) que provee:

- **auth**: middleware `requireAuth(event)`, tipo `AuthContext`, helpers
  JWT (sign/verify vía `jose`).
- **http**: jerarquía de la clase `ApiError` (badRequest/unauthorized/
  forbidden/notFound/conflict/internal), `formatResponse()`,
  `formatError()`.
- **events**: `createEventBridgeClient()` con reintentos (backoff
  exponencial, verificación de `FailedEntryCount`, manejo de fallos
  parciales para `publishMany`).
- **infra**: `createSsmReader()` (cache de 5 min), `createSecretsReader()`
  (cache de 5 min).
- **logger**: wrapper `createLogger(serviceName)` sobre Powertools
  Logger.
- **cors**: `getCorsOrigins()` lee la whitelist desde SSM
  `/orion/cors/allowed-origins`.
- **templates**: pipeline Middy `buildHandler(config)` (header normalize
  → JSON parse → log inject → X-Ray capture → auth check → error handler →
  CORS).

## Lambda Authorizer (JWT custom)

**No usamos Cognito.** La autenticación está implementada en
`contexts/identity/` (tabla `users` en PostgreSQL, contraseñas
**scrypt**-hasheadas con `N=16384, r=8, p=1`, JWT firmado con HS256).
Todas las rutas protegidas se validan mediante un único **Lambda
Authorizer** (`contexts/authorizer/`) que:

1. Lee el header `Authorization: Bearer <jwt>`.
2. Verifica la firma usando el secreto desde Secrets Manager
   (`/orion/secret/jwt-arn`).
3. Valida `exp`, `iat`, `nbf`.
4. Devuelve `{ isAuthorized: true, context: { userId, email, role } }`.
5. API Gateway adjunta el contexto a
   `event.requestContext.authorizer.lambda`.

El middleware `requireAuth` en `buildHandler()` lee este contexto y lanza
`ApiError.unauthorized()` si está ausente.

## CQRS

CQRS está implementado **implícitamente** mediante Lambdas de grano fino
(1 por caso de uso). Los comandos son handlers que mutan estado (ej.
`POST /v1/census/assignments`) y las consultas son handlers que leen
(`GET /v1/census/homes`). La separación se enforce mediante:
- Convención de nombres (`*-create`, `*-update`, `*-delete` vs
  `*-list`, `*-get`).
- Schemas Zod separados (`inputSchema` para el body de comandos, los
  query params se parsean aparte).
- Publicación de eventos solo en handlers de comando (los read events
  no se emiten; analítica los deriva del estado).

## Persistencia

- **Motor:** PostgreSQL 14+ (Aurora Serverless v2 en producción).
- **Driver:** `pg` (node-postgres) con `kysely` para query building
  tipado.
- **Migraciones:** `node-pg-migrate` v9 con naming estilo Flyway
  (`V<version>__<name>.sql`), tabla de tracking `orion_migrations` en
  schema `public`.
- **Schemas:** uno por bounded context (`identity`, `census`,
  `networks`, `risk`, `postsale`). Todos bajo `public`.
- **Transacciones:** `db.transaction().execute(async trx => ...)` para
  escrituras multi-paso (Phase 2+).

## Eventing (EDA)

- **Bus:** `orion-events-${Environment}` (bus custom, no el default).
- **Source naming:** `orion.<context>` (ej. `orion.census`,
  `orion.identity`).
- **Detail-type:** PascalCase en pasado (`CensusAssigned`,
  `NetworkExpanded`, `MaintenanceScheduled`).
- **Detail payload:** `{ version: 1, data: { ... } }` para
  compatibilidad a futuro.
- **Publicación:** `publish(event)` (single, retry 3x backoff) para
  eventos críticos; `publishMany(events)` (chunks de 10/lote, retry +
  verificación de `FailedEntryCount`) para fan-out no crítico.
- **Catálogo:** [EVENT_CATALOG.md](EVENT_CATALOG.md) (pendiente Phase 1).

## Observabilidad

- **Logs:** AWS Powertools Logger (JSON, con `correlationId`,
  `xRayTraceId`, `lambdaContext.requestId` auto-inyectados).
- **Tracing:** X-Ray vía Powertools Tracer; `Tracing: Active` en cada
  Lambda.
- **Métricas:** Powertools Metrics (EMF, sin llamadas PutMetricData) —
  agregado en Phase 2+.
- **Dashboards:** CloudWatch (Phase 4+).

## Integración cross-repo

- **orion-frontend** (Angular 22): consume los endpoints HTTP API v2.
  Envía JWTs en el header `Authorization: Bearer <token>`.
- **orion-cognitive-agent** (Bedrock / AgentCore): publica
  recomendaciones cognitivas vía EventBridge; se suscribe a eventos de
  dominio para contexto.
- **orion-infrastructure** (Terraform): aprovisiona VPC, RDS Aurora,
  bus de EventBridge, Secrets Manager, roles IAM, parámetros SSM.
- **orion-article** (reporte LaTeX): referencias de solo lectura a docs
  de ORION.

## Roadmap

Ver [DECISIONS.md](DECISIONS.md) para los ADRs y [README.md](../README.md)
para el estado por fase.
