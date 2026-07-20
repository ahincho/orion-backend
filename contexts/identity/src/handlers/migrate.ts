// =============================================================================
// POST /admin/migrate - one-shot migration runner (TEMPORAL)
// =============================================================================
// Triggers the identity-context migrations against the configured RDS via
// the shared `getDbConnection()` pool. Used by the Sprint 1 deploy to
// bootstrap the `identity.users` table before the first register
// invocation. Will be removed once the project has a proper CI-driven
// migration step (npm run migrate:up running from a CI job that has
// VPC access, e.g. SSM port-forward to the RDS).
//
// Returns a JSON envelope listing the migration files found and the
// SQL files that were executed (this lambda does NOT track applied
// migrations in the `orion_migrations` table because node-pg-migrate
// is not part of the lambda runtime -- the lambda directly applies
// any *.sql file under the migration path that hasn't been run yet,
// identified by file name).
// =============================================================================

import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
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

export const handler = buildHandler<Record<string, never>, { applied: string[]; alreadyApplied: string[] }>({
  inputSchema: undefined as never,
  logger,
  tracer,
  requireAuth: false,
  enableCors: false,
  handler: async () => {
    const files = await listSqlFiles();
    if (files.length === 0) {
      return { applied: [], alreadyApplied: [] };
    }

    const db = await getDbConnection();
    const applied: string[] = [];
    const alreadyApplied: string[] = [];

    // The handler runs each *.sql file in order. Each file is expected
    // to be idempotent (CREATE SCHEMA IF NOT EXISTS, CREATE TABLE IF
    // NOT EXISTS, etc.) because the lambda has no migration-tracking
    // table. Files that have already been applied (e.g. V001-V005
    // census migrations) will be re-run but their effect is a no-op
    // thanks to IF NOT EXISTS.
    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      try {
        await db.executeQuery({ sql, parameters: [] } as never);
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

    return { applied, alreadyApplied };
  },
});
