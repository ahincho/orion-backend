// =============================================================================
// One-shot migration runner (TEMPORAL)
// =============================================================================
// Triggers the identity-context migrations against the configured RDS via
// the shared `getDbConnection()` pool. Used by the Sprint 1 deploy to
// bootstrap the `identity.users` table before the first register
// invocation. Will be removed once the project has a proper CI-driven
// migration step (npm run migrate:up running from a CI job that has
// VPC access, e.g. SSM port-forward to the RDS).
//
// Returns a JSON envelope listing the migration files found and the
// SQL files that were executed.
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { createLogger } from '@orion/shared/logger';
import { getDbConnection } from '../infra/db-connection.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

const MIGRATIONS_DIR = resolve(
  process.env.LAMBDA_TASK_ROOT ?? process.cwd(),
  'migrations',
);

async function listSqlFiles(): Promise<string[]> {
  try {
    const entries = await readdir(MIGRATIONS_DIR);
    return entries.filter((f) => f.endsWith('.sql')).sort();
  } catch (err) {
    logger.warn('Migrations directory not readable', {
      MIGRATIONS_DIR,
      error: String(err),
    });
    return [];
  }
}

export const handler = async (): Promise<{
  applied: string[];
  alreadyApplied: string[];
  missing: string[];
}> => {
  tracer.getSegment();
  const files = await listSqlFiles();
  if (files.length === 0) {
    return { applied: [], alreadyApplied: [], missing: [MIGRATIONS_DIR] };
  }

  const db = await getDbConnection();
  const applied: string[] = [];
  const alreadyApplied: string[] = [];

  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
    try {
      // Kysely's executeQuery accepts a Compilable. We pass a raw SQL
      // string and cast to any because the strict types don't expose
      // a public helper for executing arbitrary DDL with no
      // parameters; the runtime path is `pg.query(sql, params)`, which
      // is what we want.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).executeQuery({ sql, parameters: [] });
      applied.push(file);
      logger.info('Applied migration', { file });
    } catch (err) {
      const msg = String(err);
      if (/already exists|duplicate key/i.test(msg)) {
        alreadyApplied.push(file);
      } else {
        logger.error('Migration failed', { file, error: msg });
        throw err;
      }
    }
  }

  return { applied, alreadyApplied, missing: [] };
};
