// =============================================================================
// PostgreSQL connection (kysely + node-postgres) for the census context
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

export async function getDbConnection(): Promise<Kysely<Database>> {
  if (cachedDb) return cachedDb;

  const ssm = createSsmReader();
  const secrets = createSecretsReader();

  const secretArn = await ssm.getRequiredString('/orion/db/secret-arn');
  const creds = await secrets.getJson<DbCredentials>(secretArn);

  const pool = new Pool({
    host: creds.host,
    port: creds.port,
    database: creds.database,
    user: creds.username,
    password: creds.password,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  cachedDb = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });

  return cachedDb;
}

export async function closeDbConnection(): Promise<void> {
  if (cachedDb) {
    await cachedDb.destroy();
    cachedDb = null;
  }
}
