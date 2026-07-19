// =============================================================================
// POST /v1/users/me/password - change the authenticated user's password
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { type AuthContext } from '@orion/shared/auth';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import {
  ChangePasswordInputSchema,
  type ChangePasswordInput,
} from '../schemas/change-password.schema.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

export const handler = buildHandler<ChangePasswordInput, { changed: true }>({
  inputSchema: ChangePasswordInputSchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { userService } = await buildContext();
    await userService.changePassword(auth.userId, input.currentPassword, input.newPassword);
    logger.info('Password changed', { userId: auth.userId });
    return { changed: true };
  },
});
