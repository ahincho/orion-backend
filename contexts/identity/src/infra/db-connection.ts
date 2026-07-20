// =============================================================================
// PostgreSQL connection (kysely + node-postgres)
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
    // ssl: true uses default rejectUnauthorized: false which is fine for
    // dev (RDS CA is bundled in node-postgres via the standard CA store).
    // For prod, consider ssl: { rejectUnauthorized: true, ca: ... } with
    // the RDS CA bundle pinned.
    ssl: true,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
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
