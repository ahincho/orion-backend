// =============================================================================
// POST /v1/auth/register - register a new user (no auth required)
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import { RegisterInputSchema, type RegisterInput } from '../schemas/register.schema.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

export const handler = buildHandler<RegisterInput, { user: ReturnType<typeof Object>; token: string }>({
  inputSchema: RegisterInputSchema,
  logger,
  tracer,
  requireAuth: false,
  enableCors: true,
  handler: async (input) => {
    const { userService } = await buildContext();
    const result = await userService.register(input);
    logger.info('User registered', { userId: result.user.id });
    return result;
  },
});
