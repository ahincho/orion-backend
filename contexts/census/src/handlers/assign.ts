// =============================================================================
// POST /v1/census/assignments - assign a home to a cuadrilla member
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { buildHandler } from '@orion/shared/templates';
import { type AuthContext } from '@orion/shared/auth';
import { createLogger } from '@orion/shared/logger';
import { ApiError } from '@orion/shared/http';
import { buildContext } from '../composition.js';
import { AssignHomeInputSchema, type AssignHomeInput } from '../schemas/assign.schema.js';
import type { Assignment } from '../domain/assignment.js';

const logger = createLogger('census');
const tracer = new Tracer({ serviceName: 'census' });

export const handler = buildHandler<AssignHomeInput, Assignment>({
  inputSchema: AssignHomeInputSchema,
  logger,
  tracer,
  requireAuth: true,
  enableCors: true,
  handler: async (input, _event, auth: AuthContext | undefined) => {
    if (!auth) throw new Error('requireAuth=true but auth is undefined (bug)');
    if (auth.role !== 'supervisor') {
      throw ApiError.forbidden('Only supervisors can assign homes', {
        code: 'auth.role_required',
        message: 'Only supervisors can assign homes',
        meta: { requiredRoles: ['supervisor'], currentRole: auth.role },
      });
    }
    const { censusService } = await buildContext();
    const assignment = await censusService.assignHome({
      homeId: input.homeId,
      assigneeId: input.assigneeId,
      assignedBy: auth.userId,
      scheduledDate: input.scheduledDate,
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    logger.info('Home assigned', { assignmentId: assignment.id, homeId: input.homeId });
    return assignment;
  },
});
