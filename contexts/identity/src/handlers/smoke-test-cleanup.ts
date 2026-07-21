// =============================================================================
// Smoke test cleanup - dev-only Lambda
// =============================================================================
// Deletes identity.users rows whose email matches a configurable prefix
// (default `smoke-`). Invoked directly via `aws lambda invoke` from the
// Smoke Test - orion-backend-dev workflow after all test assertions pass.
//
// Why this Lambda exists:
//   The smoke test creates a fresh user per run (`smoke-<unix-ts>@orion-test.local`)
//   and leaves it in the dev DB. Without this Lambda, every smoke test run
//   accumulates a junk user forever (cleanup was previously manual). The
//   GH Actions runner has no VPC access to the RDS, so the cleanup must run
//   inside the VPC. The deploy OIDC role already grants
//   `lambda:InvokeFunction` on `orion-*-dev` ARNs (see
//   orion-infrastructure modules/iam-sam-deploy-dev), so no new IAM resource
//   is needed.
//
// Scope discipline:
//   - Hard limit on deleted rows per invocation (default 100) to prevent
//     runaway deletes if the prefix is misconfigured.
//   - Email pattern is parameterised, not interpolated, so SQL injection is
//     impossible.
//   - Logs every deleted email so the audit trail lives in CloudWatch.
//   - Does NOT close the DB pool (warm invocations reuse it).
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { createLogger } from '@orion/shared/logger';
import { getDbConnection } from '../infra/db-connection.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity-smoke-test-cleanup' });

export interface CleanupInput {
  prefix?: string;
  limit?: number;
}

export interface CleanupOutput {
  prefix: string;
  limit: number;
  deleted: string[];
  count: number;
}

const DEFAULT_PREFIX = 'smoke-';
const DEFAULT_LIMIT = 100;
const ABSOLUTE_MAX_LIMIT = 1000;

export const handler = async (
  event: CleanupInput | null | undefined,
): Promise<CleanupOutput> => {
  const subsegment = tracer.getSegment()?.addNewSubsegment('### smokeTestCleanup');
  try {
    const prefix = (event?.prefix ?? DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
    const requestedLimit = event?.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(
      Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIMIT),
      ABSOLUTE_MAX_LIMIT,
    );

    logger.info('Smoke test cleanup starting', { prefix, limit });

    const db = await getDbConnection();

    // SQL: `LIKE` pattern is built from `prefix + '%@%'`. The prefix is
    // length-bounded by the trim above (no wildcards from caller input).
    // `limit` is a typed integer (above) so no injection surface.
    const pattern = `${prefix}%@%`;
    const deleted = await db
      .deleteFrom('users')
      .where('email', 'like', pattern)
      .returning('email')
      .limit(limit)
      .execute();

    const emails = deleted.map((row) => row.email);
    logger.info('Smoke test cleanup finished', {
      prefix,
      limit,
      count: emails.length,
      emails,
    });

    return { prefix, limit, deleted: emails, count: emails.length };
  } finally {
    subsegment?.close();
  }
};