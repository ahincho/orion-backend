// =============================================================================
// GET /v1/users/me - return the authenticated user's public profile
// =============================================================================
// Requires requireAuth: true (Lambda Authorizer validates JWT and
// attaches userId via event.requestContext.authorizer.lambda).
// =============================================================================

import { z } from 'zod';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler, type AuthContext } from '@orion/shared/templates';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import { type PublicUser } from '../domain/user.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

// Empty body schema (GET has no body, but buildHandler requires one).
const EmptyInputSchema = z.object({}).strict();

export const handler = buildHandler<z.infer<typeof EmptyInputSchema>, PublicUser>({
  inputSchema: EmptyInputSchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (_input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { userService } = await buildContext();
    return userService.getById(auth.userId);
  },
});
