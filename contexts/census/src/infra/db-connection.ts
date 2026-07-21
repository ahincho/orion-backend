// =============================================================================
// PostgreSQL connection (kysely + node-postgres) for the census context
// =============================================================================
// Reads credentials from Secrets Manager via SSM ARN. Cached singleton
// survives warm Lambda invocations.
// =============================================================================

import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { createSsmReader, createSecretsReader } from '@orion/shared/infra';
import type { Database } from './database.js';

interface DbCredentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

const { Pool } = pg;

let cachedDb: Kysely<Database> | null = null;
let cachedPool: pg.Pool | null = null;

export async function getDbConnection(): Promise<Kysely<Database>> {
  if (cachedDb) return cachedDb;

  const ssm = createSsmReader();
  const secrets = createSecretsReader();

  const secretArn = await ssm.getRequiredString('/orion/db/secret-arn');
  const creds = await secrets.getJson<DbCredentials>(secretArn);

  cachedPool = new Pool({
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.username,
    password: creds.password,
    // RDS parameter group has rds.force_ssl=1 and ssl=1; without ssl, the
    // server returns "no pg_hba.conf entry for host ..., no encryption".
    // With ssl: true (default rejectUnauthorized: true) the node-postgres
    // default CA store does not include the RDS CA bundle, so it errors
    // with "self-signed certificate in certificate chain". For dev, set
    // rejectUnauthorized: false (encryption without verification).
    // For prod, use rejectUnauthorized: true with the RDS CA bundle
    // pinned via AWS_BUNDLE_CA or an explicit `ca` option (deferred to
    // a future modules/kms + prod module work).
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  // Schema bootstrap: las migraciones crean `census.homes`,
  // `census.assignments`, etc. (un schema por bounded context). Sin
  // search_path explicito, las queries de Kysely (e.g.
  // `db.selectFrom('homes')`) resuelven a `public.homes` por defecto, lo
  // que falla con `relation "homes" does not exist` en runtime.
  //
  // Solucion: emitir `SET search_path` en cada nueva conexion del pool via
  // el hook `on('connect')`. Usamos `census,public` (no solo `census`) por
  // si alguna query referencie tablas del schema `public` (e.g.
  // `orion_migrations`).
  // Una alternativa (kysely `currentSchema`) afecta solo a Kysely y no a
  // las queries crudas (e.g. node-pg-migrate corre con su propio pool);
  // `SET search_path` a nivel de sesion es la unica opcion que cubre ambos.
  cachedPool.on('connect', (client) => {
    void client.query('SET search_path TO census, public');
  });

  cachedDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool: cachedPool }),
  });

  return cachedDb;
}

export async function closeDbConnection(): Promise<void> {
  if (cachedDb) {
    await cachedDb.destroy();
    cachedDb = null;
  }
  if (cachedPool) {
    await cachedPool.end();
    cachedPool = null;
  }
}
