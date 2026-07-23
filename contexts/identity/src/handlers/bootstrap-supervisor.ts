// =============================================================================
// One-shot advisor bootstrap Lambda (TEMPORAL)
// =============================================================================
// Creates the FIRST advisor (highest RBAC role) in a freshly bootstrapped
// environment. Used by the `Bootstrap Supervisor - orion-backend-dev` GH
// workflow (workflow_dispatch) to seed the initial admin user without
// manually POSTing /v1/auth/register + curl-loops.
//
// Identity contract (Stage 6 of ADR 0010 user-management):
//   Input  : { role?: 'advisor', email?, fullName? }   (all optional)
//   Output : {
//     created: number,
//     skipped: number,
//     errors:  [{ email, code, message }],
//     user?:   { id, email, fullName, role, active }
//   }
//
// Behaviour:
//   - Reads the shared dev password from SM (JSON shape: {password, ...}).
//   - Decides the role to assign (default `advisor`). The first user must be
//     advisor so they can create supervisors + agents via /v1/users.* once
//     the seed run finishes.
//   - If a user with that email already exists, returns `skipped > 0` (no-op).
//   - Otherwise inserts the row via the identity `userService.create()` path
//     (re-uses scrypt hashing from password-hasher.ts via hashPassword).
//   - Calls the registered handlers shape: returns { created, skipped, errors }
//     to keep parity with `seed-users.ts`.
//
// Why a separate Lambda (not a seed-users Lambda) ?
//   Bootstrap only ever runs **once per environment**, with a fixed payload.
//   The seed-users Lambda is per-role and idempotent for groups.
//   Splitting them keeps each Lambda's contract tight and reviewable.
//
// Concurrency: invoked directly from GH Actions (no API Gateway, no
// event-bridge), so the only client is `aws lambda invoke` driven by the
// workflow. The shared dev password is **never** logged - the handler only
// surfaces the email / id, not the hash or the plaintext.
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
const tracer = new Tracer({ serviceName: 'identity-bootstrap-supervisor' });

interface BootstrapInput {
  /** RBAC role to create. Defaults to `advisor`. Must be a valid USER_ROLES entry. */
  role?: UserRole;
  /** Email of the bootstrap user. Defaults to `bootstrap@<email-domain>`. */
  email?: string;
  /** Full name of the bootstrap user. Defaults to `Bootstrap Advisor`. */
  fullName?: string;
}

interface BootstrapOutputItem {
  email: string;
  code: string;
  message: string;
}

interface BootstrapOutput {
  created: number;
  skipped: number;
  errors: BootstrapOutputItem[];
  user?: { id: string; email: string; fullName: string; role: UserRole; active: boolean };
}

interface SharedDevPasswordEnvelope {
  version?: number;
  use?: string;
  password?: string;
  rotatedAt?: string;
  [k: string]: unknown;
}

const DEFAULT_ROLE: UserRole = 'advisor';
const DEFAULT_FULL_NAME = 'Bootstrap Advisor';

function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v);
}

export const handler = async (event: BootstrapInput | null | undefined): Promise<BootstrapOutput> => {
  const subsegment = tracer.getSegment()?.addNewSubsegment('### bootstrapSupervisor');
  try {
    const requestedRole = event?.role;
    const role: UserRole = isUserRole(requestedRole) ? requestedRole : DEFAULT_ROLE;

    const ssm = createSsmReader();
    const secrets = createSecretsReader();
    const emailDomain = await ssm.getRequiredString('/orion/seed/email-domain');
    const sharedDevPasswordSecretArn =
      process.env.SHARED_DEV_PASSWORD_SECRET_ARN ??
      (await ssm.getRequiredString('/orion/seed/shared-dev-password-secret-arn'));
    const sharedDevPasswordEnvelope = await secrets.getJson<SharedDevPasswordEnvelope>(
      sharedDevPasswordSecretArn,
    );
    const sharedDevPassword = sharedDevPasswordEnvelope.password;
    if (typeof sharedDevPassword !== 'string' || sharedDevPassword.length < 8) {
      throw new Error(
        `Shared dev password missing or too short in secret ${sharedDevPasswordSecretArn}`,
      );
    }

    const email = (event?.email ?? `bootstrap@${emailDomain}`).toLowerCase().trim();
    const fullName = event?.fullName?.trim() || DEFAULT_FULL_NAME;

    logger.info('bootstrap starting', { role, email, fullName });

    const db = await getDbConnection();
    const userRepository = createUserRepository(db);

    const existing = await withDbErrorMapping('users.findByEmail:bootstrap', () =>
      userRepository.findByEmail(email),
    );
    if (existing) {
      logger.info('bootstrap skipped (user already exists)', {
        email,
        existingRole: existing.role,
      });
      return {
        created: 0,
        skipped: 1,
        errors: [],
        user: {
          id: existing.id,
          email: existing.email,
          fullName: existing.fullName,
          role: existing.role,
          active: existing.active,
        },
      };
    }

    const id = randomUUID();
    const passwordHash = await hashPassword(sharedDevPassword);
    const user = await withDbErrorMapping('users.create:bootstrap', () =>
      userRepository.create({
        id,
        email,
        fullName,
        role,
        password: sharedDevPassword,
        passwordHash,
      }),
    );

    logger.info('bootstrap created first advisor', {
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      created: 1,
      skipped: 0,
      errors: [],
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        active: user.active,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorName = err instanceof Error ? err.name : 'unknown';
    const cause =
      err instanceof Error && err.cause instanceof Error ? err.cause : undefined;
    const causeName = cause?.name ?? '';
    const causeMessage = cause?.message ?? '';
    const errorCode =
      typeof err === 'object' && err !== null && '$metadata' in err
        ? String((err as { $metadata: { httpStatusCode?: number } }).$metadata.httpStatusCode ?? '')
        : '';
    logger.error('bootstrap failed', {
      error: message,
      errorName,
      causeName,
      causeMessage,
      errorCode,
    });
    return {
      created: 0,
      skipped: 0,
      errors: [
        {
          email: 'unknown',
          code: 'bootstrap.failure',
          message: `${message} (${errorName}${causeName ? ` cause=${causeName}:${causeMessage}` : ''}${errorCode ? ` http=${errorCode}` : ''})`,
        },
      ],
    };
  } finally {
    subsegment?.close();
  }
};
