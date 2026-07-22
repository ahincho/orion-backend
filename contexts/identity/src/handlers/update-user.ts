// =============================================================================
// PATCH /v1/users/{userId} - partial update (email/fullName/role/active)
// =============================================================================
// Authorization: self can update only email/fullName; advisor any target;
// supervisor only agent-role targets; agent -> 403. Self-* rules enforced
// in userService.updateUser (no self-deactivation, no self role change).
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
import {
  UpdateUserInputSchema,
  type UpdateUserInput,
} from '../schemas/update-user.schema.js';
import { type PublicUser } from '../domain/user.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

// Path + body are validated independently by build-handler. We merge the
// two at runtime since the handler signature only allows one inputSchema.
export const handler = buildHandler<
  UserIdParam & Partial<UpdateUserInput>,
  PublicUser
>({
  inputSchema: UserIdParamSchema.extend(UpdateUserInputSchema.shape),
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { userId, ...rest } = input;
    // Strip undefined values so exactOptionalPropertyTypes accepts the patch.
    const patch: {
      email?: string;
      fullName?: string;
      role?: 'advisor' | 'supervisor' | 'agent';
      active?: boolean;
    } = {};
    if (rest.email !== undefined) patch.email = rest.email;
    if (rest.fullName !== undefined) patch.fullName = rest.fullName;
    if (rest.role !== undefined) patch.role = rest.role;
    if (rest.active !== undefined) patch.active = rest.active;
    const { userService } = await buildContext();
    const user = await userService.updateUser(userId, patch, auth);
    logger.info('User updated', { requesterId: auth.userId, targetId: userId });
    return user;
  },
});