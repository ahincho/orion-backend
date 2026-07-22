// =============================================================================
// POST /v1/users/{userId}/activate - set active=true
// =============================================================================
// Authorization: advisor any target; supervisor only agent targets;
// agent -> 403. Activation is not subject to the self-* rules (admins can
// re-enable a previously-deactivated user including themselves). Idempotent.
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { type AuthContext } from '@orion/shared/auth';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import {
  UserIdParamSchema,
  type UserIdParam,
} from '../schemas/user-id-param.schema.js';
import { type PublicUser } from '../domain/user.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

export const handler = buildHandler<UserIdParam, PublicUser>({
  inputSchema: UserIdParamSchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { userService } = await buildContext();
    const user = await userService.activateUser(input.userId, auth);
    logger.info('User activated', { requesterId: auth.userId, targetId: input.userId });
    return user;
  },
});