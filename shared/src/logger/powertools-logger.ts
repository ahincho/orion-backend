// =============================================================================
// Powertools Logger factory
// =============================================================================
// Thin wrapper over @aws-lambda-powertools/logger. Conventions:
//   - serviceName: '<context>-<env>' (e.g. 'identity-dev', 'census-prod')
//   - logLevel: from LOG_LEVEL env var, default 'INFO'
//   - environment: from ENVIRONMENT env var
//
// Pair with the injectLambdaContext middleware in build-handler.
// =============================================================================

import { Logger, type LogLevel } from '@aws-lambda-powertools/logger';

export type ServiceName =
  | 'authorizer'
  | 'identity'
  | 'census'
  | 'networks'
  | 'risk'
  | 'postsale'
  | 'shared';

export function createLogger(serviceName: ServiceName): Logger {
  const logLevel = (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'INFO';
  const environment = process.env.ENVIRONMENT ?? 'dev';

  return new Logger({
    serviceName: `${serviceName}-${environment}`,
    logLevel,
    environment,
  });
}
