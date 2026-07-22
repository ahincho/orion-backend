// =============================================================================
// GET /v1/users - list users (paginated, filterable by role/active)
// =============================================================================
// Authorization: advisor (any filter), supervisor (forced to agent role),
// agent -> 403. Implemented in userService.listUsers.
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { type AuthContext } from '@orion/shared/auth';
import { type PaginatedResponse } from '@orion/shared/http';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import {
  ListUsersQuerySchema,
  type ListUsersQuery,
} from '../schemas/list-users.schema.js';
import { type PublicUser } from '../domain/user.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

export const handler = buildHandler<ListUsersQuery, PaginatedResponse<PublicUser>>({
  inputSchema: ListUsersQuerySchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { userService } = await buildContext();
    const result = await userService.listUsers(
      {
        page: input.page,
        perPage: input.perPage,
        ...(input.role ? { roles: input.role } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      },
      auth,
    );
    logger.info('Users listed', { requesterId: auth.userId, count: result.items.length });
    return result;
  },
});