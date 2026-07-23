// =============================================================================
// Idempotent per-role seed Lambda (Stage 6 of ADR 0010 user-management)
// =============================================================================
// Seeds a list of advisors / supervisors / agents into `identity.users`
// with the shared dev password. Idempotent: re-running with the same input
// produces `created=0, skipped=N, errors=[]`. New users are created when an
// email is not yet present in the table.
//
// Identity contract (matches the cookbook `seed-users-{role}.yml` consumer):
//   Input  : {
//     group:  'advisors' | 'supervisors' | 'agents',
//     users?: [{ email: string, fullName?: string }],  // optional; defaults to fixture
//   }
//   Output : {
//     created: number,
//     skipped: number,
//     errors:  [{ email: string, code: string, message: string }],
//     group:  string,
//     users:  [{ email, status: 'created' | 'skipped' | 'failed', id?, fullName? }]
//   }
//
// Behaviour:
//   - Resolves the email domain via SSM (`/orion/seed/email-domain`,
//     SecureString).
//   - Reads the shared dev password from SM (same envelope shape as
//     bootstrap-supervisor: `{ version, use, password, rotatedAt }`).
//   - Normalises the group string to a role: 'advisors' -> 'advisor', etc.
//     Unknown groups fail fast with one synthetic error in `errors[]` (no
//     DB writes).
//   - For each user, performs the existsByEmail check + insert through the
//     typed `userRepository` (uses the same `password-hasher.ts` scrypt).
//   - Logs every created/skipped/failed user for audit. **Never** logs the
//     password or the hash.
//
// Idempotency:
//   - existsByEmail is the single source of truth: if a row exists with the
//     same email, the user is skipped (no role change, no overwrite, no
//     re-hashing). This makes re-runs safe across environments and across
//     manual / automated invocations.
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { createLogger } from '@orion/shared/logger';
import { createSsmReader, createSecretsReader, withDbErrorMapping } from '@orion/shared/infra';
import { getDbConnection } from '../infra/db-connection.js';
import { createUserRepository } from '../infra/user-repository.js';
import { USER_ROLES, type UserRole } from '../domain/user.js';
import { hashPassword } from '../password-hasher.js';
import { randomUUID } from 'node:crypto';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity-seed-users' });

export type SeedGroup = 'advisors' | 'supervisors' | 'agents';

interface SeedUserInput {
  email: string;
  fullName?: string;
}

interface SeedInput {
  /** Role group. Determines the user role + default fixture list. */
  group: SeedGroup;
  /** Optional explicit list. When omitted, the default fixture for `group` is used. */
  users?: SeedUserInput[];
}

interface SeedError {
  email: string;
  code: string;
  message: string;
}

type SeedEntryStatus = 'created' | 'skipped' | 'failed';

interface SeedEntry {
  email: string;
  fullName: string;
  status: SeedEntryStatus;
  id?: string;
}

interface SeedOutput {
  created: number;
  skipped: number;
  errors: SeedError[];
  group: SeedGroup;
  role: UserRole;
  users: SeedEntry[];
}

interface SharedDevPasswordEnvelope {
  version?: number;
  use?: string;
  password?: string;
  rotatedAt?: string;
  [k: string]: unknown;
}

// =============================================================================
// Default fixtures per group. The cookbook `seed-users-{role}.yml` invokes
// this Lambda with an empty payload when no `users` is provided, so the
// canned list is the canonical seed for the dev environment. Adjust the
// counts here (3 advisors + 2 supervisors + 5 agents) without touching the
// cookbook.
// =============================================================================
const DEFAULT_FIXTURES: Record<SeedGroup, Required<Pick<SeedUserInput, 'email' | 'fullName'>>[]> = {
  advisors: [
    { email: 'advisor-001', fullName: 'Advisor 001' },
    { email: 'advisor-002', fullName: 'Advisor 002' },
    { email: 'advisor-003', fullName: 'Advisor 003' },
  ],
  supervisors: [
    { email: 'supervisor-001', fullName: 'Supervisor 001' },
    { email: 'supervisor-002', fullName: 'Supervisor 002' },
  ],
  agents: [
    { email: 'agent-001', fullName: 'Agent 001' },
    { email: 'agent-002', fullName: 'Agent 002' },
    { email: 'agent-003', fullName: 'Agent 003' },
    { email: 'agent-004', fullName: 'Agent 004' },
    { email: 'agent-005', fullName: 'Agent 005' },
  ],
};

const GROUP_TO_ROLE: Record<SeedGroup, UserRole> = {
  advisors: 'advisor',
  supervisors: 'supervisor',
  agents: 'agent',
};

function isSeedGroup(v: unknown): v is SeedGroup {
  return v === 'advisors' || v === 'supervisors' || v === 'agents';
}

function isUserRole(v: string): v is UserRole {
  return (USER_ROLES as readonly string[]).includes(v);
}

export const handler = async (event: SeedInput | null | undefined): Promise<SeedOutput> => {
  const subsegment = tracer.getSegment()?.addNewSubsegment('### seedUsers');
  try {
    if (!event || !isSeedGroup(event.group)) {
      const message = `Invalid or missing 'group' (expected one of advisors|supervisors|agents, got ${String(
        event?.group,
      )})`;
      logger.error('seed refused', { error: message });
      return {
        created: 0,
        skipped: 0,
        errors: [{ email: 'unknown', code: 'seed.invalid_group', message }],
        group: 'agents',
        role: 'agent',
        users: [],
      };
    }

    const group = event.group;
    const role = GROUP_TO_ROLE[group];
    if (!isUserRole(role)) {
      const message = `Internal mapping error: '${group}' did not resolve to a valid USER_ROLES entry`;
      return {
        created: 0,
        skipped: 0,
        errors: [{ email: 'unknown', code: 'seed.invalid_role', message }],
        group,
        role: 'agent',
        users: [],
      };
    }

    const fixtures = event.users && event.users.length > 0 ? event.users : DEFAULT_FIXTURES[group];

    const ssm = createSsmReader();
    const secrets = createSecretsReader();
    const emailDomain = await ssm.getRequiredString('/orion/seed/email-domain');
    const sharedDevPasswordSecretArn =
      process.env.SHARED_DEV_PASSWORD_SECRET_ARN ??
      (await ssm.getRequiredString('/orion/seed/shared-dev-password-secret-arn'));
    const envelope = await secrets.getJson<SharedDevPasswordEnvelope>(sharedDevPasswordSecretArn);
    const sharedDevPassword = envelope.password;
    if (typeof sharedDevPassword !== 'string' || sharedDevPassword.length < 8) {
      const message = `Shared dev password missing or too short in secret ${sharedDevPasswordSecretArn}`;
      return {
        created: 0,
        skipped: 0,
        errors: [{ email: 'unknown', code: 'seed.password_missing', message }],
        group,
        role,
        users: [],
      };
    }

    const passwordHash = await hashPassword(sharedDevPassword);
    const db = await getDbConnection();
    const userRepository = createUserRepository(db);

    const entries: SeedEntry[] = [];
    const errors: SeedError[] = [];
    let created = 0;
    let skipped = 0;

    for (const spec of fixtures) {
      const localPart = spec.email.trim();
      const email = `${localPart}@${emailDomain}`.toLowerCase();
      const fullName = (spec.fullName ?? localPart).trim() || localPart;
      try {
        const existing = await withDbErrorMapping('users.findByEmail:seed', () =>
          userRepository.findByEmail(email),
        );
        if (existing) {
          skipped += 1;
          entries.push({ email, fullName: existing.fullName, status: 'skipped', id: existing.id });
          logger.info('seed: skipped (existing user)', { email, id: existing.id });
          continue;
        }
        const id = randomUUID();
        const user = await withDbErrorMapping('users.create:seed', () =>
          userRepository.create({
            id,
            email,
            fullName,
            role,
            password: sharedDevPassword,
            passwordHash,
          }),
        );
        created += 1;
        entries.push({ email, fullName: user.fullName, status: 'created', id: user.id });
        logger.info('seed: created', { email, id: user.id, role });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          /already exists|duplicate key|users_email_key/i.test(message)
            ? 'seed.email_exists'
            : 'seed.create_failed';
        errors.push({ email, code, message });
        entries.push({ email, fullName, status: 'failed' });
        logger.error('seed: failed for user', { email, code, error: message });
      }
    }

    logger.info('seed complete', { group, role, created, skipped, errorCount: errors.length });
    return { created, skipped, errors, group, role, users: entries };
  } finally {
    subsegment?.close();
  }
};
