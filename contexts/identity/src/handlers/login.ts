// =============================================================================
// POST /v1/auth/login - authenticate and receive a JWT
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import { LoginInputSchema, type LoginInput } from '../schemas/login.schema.js';

const logger = createLogger('identity');
const tracer = new Tracer({ serviceName: 'identity' });

export const handler = buildHandler<LoginInput, { user: ReturnType<typeof Object>; token: string }>({
  inputSchema: LoginInputSchema,
  logger,
  tracer,
  requireAuth: false,
  enableCors: true,
  handler: async (input) => {
    const { userService } = await buildContext();
    const result = await userService.authenticate(input.email, input.password);
    logger.info('User logged in', { userId: result.user.id });
    return result;
  },
});
