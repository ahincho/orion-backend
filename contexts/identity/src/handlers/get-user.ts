// =============================================================================
// GET /v1/users/{userId} - fetch a single user by id
// =============================================================================
// Authorization: self always; advisor any; supervisor only agent-role
// targets; agent only self. Implemented in userService.getUser.
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
    const user = await userService.getUser(input.userId, auth);
    logger.info('User fetched', { requesterId: auth.userId, targetId: input.userId });
    return user;
  },
});