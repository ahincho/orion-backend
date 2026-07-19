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

import { Logger } from '@aws-lambda-powertools/logger';
import type { LogLevel } from '@aws-lambda-powertools/logger/types';

export type ServiceName =
  'authorizer' | 'identity' | 'census' | 'networks' | 'risk' | 'postsale' | 'shared';

export function createLogger(serviceName: ServiceName): Logger {
  const envLevel = process.env.LOG_LEVEL;
  const validLevels: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL', 'SILENT'];
  const normalized = envLevel ? envLevel.toUpperCase() : 'INFO';
  const logLevel = validLevels.includes(normalized as LogLevel) ? (normalized as LogLevel) : 'INFO';
  const environment = process.env.ENVIRONMENT ?? 'dev';

  return new Logger({
    serviceName: `${serviceName}-${environment}`,
    logLevel,
    environment,
  });
}
