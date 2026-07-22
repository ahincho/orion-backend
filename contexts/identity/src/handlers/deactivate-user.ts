// =============================================================================
// POST /v1/users/{userId}/deactivate - set active=false (soft delete)
// =============================================================================
// Authorization: advisor any target except self; supervisor only agent
// targets (no self-deactivation); agent -> 403. Idempotent: re-deactivating
// an already-inactive user returns the current user without an event.
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
    const user = await userService.deactivateUser(input.userId, auth);
    logger.info('User deactivated', { requesterId: auth.userId, targetId: input.userId });
    return user;
  },
});