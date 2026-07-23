# 0007 - PostgreSQL sobre Aurora Serverless v2 con kysely + node-pg-migrate

- Estado: Aceptado (2026-06-30, durante el bootstrap del repo)
- Deciders: @ahincho
- Supersedes: -

## Contexto y problema

La capa de persistencia debe soportar:

- Un schema por bounded context (`identity`, `census`, `networks`,
  `risk`, `postsale`, todos bajo `public`).
- Migraciones forward-only de schema en deploy.
- Query building type-safe en TypeScript.
- Costo idle barato (el bootstrap es un único environment en una única
  región y el tráfico es a ráfagas).

Opciones:

- **RDS PostgreSQL (provisioned):** costo predecible pero el costo
  idle es alto para un proyecto en bootstrap.
- **Aurora Serverless v2:** auto-scaling de ACU, pay-per-second; más
  barato en idle pero el cold-start en la primera query es ~10s.
- **DynamoDB:** no es PostgreSQL; cambiaría la shape del API
  downstream.
- **PlanetScale / Neon:** terceros; afuera del boundary de AWS donde
  trabajamos por lo demás.

## Decisión

- **Motor:** Aurora Serverless v2 PostgreSQL 14+.
- **Driver:** `pg` (node-postgres) para el connection pool, detrás de
  `kysely` para query construction tipado.
- **Migraciones:** `node-pg-migrate` v9 con
  `migrationsTable: 'orion_migrations'`, `migrationsSchema: 'public'`,
  nombres estilo Flyway `V<version>__<name>.sql`, tracked en
  `public.orion_migrations`.
- **Schema por contexto:** cada bounded context es dueño de su
  schema; las tablas se cross-referencian con constraints FK
  explícitas declaradas en las migrations del contexto posterior (ej.
  `census.homes.assigned_user_id` -> `identity.users.id`).
- **Escrituras transaccionales** (`db.transaction().execute(async trx
  => ...)`) para escrituras multi-paso en Phase 2+.

## Por qué Aurora Serverless v2 (no RDS provisioned)

- Pay-per-second por ACU se alinea con el tráfico a ráfagas del
  bootstrap.
- v2 tiene cold-start más rápido que v1 (la última tenía una pausa
  de 30s).
- Compartido con otros servicios AWS vía VPC peering, sin red
  externa.

## Por qué kysely (no raw SQL ni Prisma)

- `kysely` es un typed query builder que mantiene la interfaz de las
  tablas como un módulo TS (tipo `Database`). Devuelve filas planas,
  lo que deja a los handlers libres de quirks específicos de un ORM.
- No hay un step `prisma generate` en CI; los builds son puro
  `tsc -b`.
- Migrar a otro store más adelante significa reescribir la interfaz
  `Database` y las clases repository, SIN tocar los handlers.

## Por qué node-pg-migrate

- Archivos de migración en SQL plano (sin boilerplate JS de
  migration que mantener).
- `--use-glob` (npm v9+) acepta `V*.sql` automáticamente.
- Trackea las migraciones aplicadas en una sola tabla; roll-forward
  es trivial, roll-back requiere un `migrate:down` deliberado.

## Consecuencias

### Positivas

- Postgres confiable más barato para tráfico bajo.
- Schema por contexto mantiene los bounded contexts independientes
  a nivel de base de datos.
- kysely + `pg` es completamente estilo-síncrono para nuestros
  repositories simples.
- El historial de migraciones es SQL plano; los reviewers ven el
  cambio directamente.

### Negativas

- Aurora v2 pausa en idle; el primer request después de una espera
  larga paga el cold-start (~5-10s). Aceptable para tráfico de
  bootstrap, se medirá en Phase 2+ y se podrá cambiar a un Aurora
  fixed-capacity si lastima la UX.
- node-pg-migrate no hace diff declarativo (estilo Prisma);
  acumulamos `.sql` con el tiempo y pruneamos las migraciones viejas
  cuando conviene.
