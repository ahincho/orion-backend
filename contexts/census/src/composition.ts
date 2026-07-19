// =============================================================================
// Composition root for the census context
// =============================================================================

import { Tracer } from '@aws-lambda-powertools/tracer';
import { createLogger } from '@orion/shared/logger';
import { createSsmReader } from '@orion/shared/infra';
import { createEventBridgeClient } from '@orion/shared/events';
import { getDbConnection } from './infra/db-connection.js';
import { createHomeRepository } from './infra/home-repository.js';
import { createAssignmentRepository } from './infra/assignment-repository.js';
import { createCensusService, type CensusService } from './service/census-service.js';

export interface CensusContext {
  censusService: CensusService;
  logger: ReturnType<typeof createLogger>;
  tracer: Tracer;
}

let cached: CensusContext | null = null;
let pending: Promise<CensusContext> | null = null;

export async function buildContext(): Promise<CensusContext> {
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    const logger = createLogger('census');
    const tracer = new Tracer({ serviceName: 'census' });

    const ssm = createSsmReader();
    const eventBusArn = await ssm.getRequiredString('/orion/eventbridge/bus-arn');

    const eventPublisher = createEventBridgeClient({ busArn: eventBusArn });
    const db = await getDbConnection();
    const homeRepository = createHomeRepository(db);
    const assignmentRepository = createAssignmentRepository(db);
    const censusService = createCensusService({
      homeRepository,
      assignmentRepository,
      eventPublisher,
    });

    cached = { censusService, logger, tracer };
    return cached;
  })();
  return pending;
}
