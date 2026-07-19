// =============================================================================
// Composition root for the identity context
// =============================================================================
// Lazy singleton with promise guard. Survives warm Lambda invocations.
// Reads JWT secret ARN from SSM and secret value from Secrets Manager.
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { createLogger } from '@orion/shared/logger';
import { createSsmReader, createSecretsReader } from '@orion/shared/infra';
import { createEventBridgeClient } from '@orion/shared/events';
import { signJwt } from '@orion/shared/auth';
import { getDbConnection } from './infra/db-connection.js';
import { createUserRepository } from './infra/user-repository.js';
import { createUserService, type UserService, type JwtSigner } from './service/user-service.js';

export interface IdentityContext {
  userService: UserService;
  logger: ReturnType<typeof createLogger>;
  tracer: Tracer;
}

let cached: IdentityContext | null = null;
let pending: Promise<IdentityContext> | null = null;

export async function buildContext(): Promise<IdentityContext> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const logger = createLogger('identity');
    const tracer = new Tracer({ serviceName: 'identity' });

    const ssm = createSsmReader();
    const secrets = createSecretsReader();
    const eventBusArn = await ssm.getRequiredString('/orion/eventbridge/bus-arn');
    const jwtSecretArn = await ssm.getRequiredString('/orion/secret/jwt-arn');
    const jwtSecretValue = await secrets.getRequiredString(jwtSecretArn);
    const jwtSecretBytes = new TextEncoder().encode(jwtSecretValue);

    const eventPublisher = createEventBridgeClient({ busArn: eventBusArn });
    const db = await getDbConnection();
    const userRepository = createUserRepository(db);

    const jwtSigner: JwtSigner = {
      sign: (subject, email, role) => signJwt(jwtSecretBytes, { subject, email, role }),
    };

    const userService = createUserService({ userRepository, eventPublisher, jwtSigner });

    cached = { userService, logger, tracer };
    return cached;
  })();
  return pending;
}
