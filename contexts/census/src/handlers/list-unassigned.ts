// =============================================================================
// GET /v1/census/homes/unassigned - list homes with interest and no assignee
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler, type AuthContext } from '@orion/shared/templates';
import { createLogger } from '@orion/shared/logger';
import { buildContext } from '../composition.js';
import { ListUnassignedQuerySchema } from '../schemas/list.schema.js';
import type { PublicHome } from '../domain/home.js';

const logger = createLogger('census');
const tracer = new Tracer({ serviceName: 'census' });

export const handler = buildHandler<{ limit: number }, PublicHome[]>({
  inputSchema: ListUnassignedQuerySchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    const { censusService } = await buildContext();
    logger.info('List unassigned homes', { userId: auth.userId, limit: input.limit });
    return censusService.listUnassignedWithInterest(input.limit);
  },
});
