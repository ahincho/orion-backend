// =============================================================================
// requireAuth - safety middleware that asserts the Lambda Authorizer ran
// =============================================================================
// This is NOT the cryptographic validation. The Lambda Authorizer
// (contexts/authorizer/) verifies the JWT signature and signature. This
// function only extracts the context that the Authorizer attached and
// throws 401 if missing (defense in depth).
//
// Always pair with `requireAuth: true` in buildHandler() config.
// =============================================================================

import type { Logger } from '@aws-lambda-powertools/logger';
import { ApiError } from '../http/api-error.js';
import type { AuthContext } from './auth-context.js';

/**
 * Shape of the Lambda Authorizer context attached to event.requestContext.authorizer.lambda.
 * The Lambda Authorizer function returns this as its `context` field.
 */
export interface LambdaAuthorizerContext {
  userId?: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

export function requireAuth(event: unknown, logger: Logger): AuthContext {
  const ctx = (event as { requestContext?: { authorizer?: { lambda?: LambdaAuthorizerContext } } })
    ?.requestContext?.authorizer?.lambda;

  if (!ctx?.userId || typeof ctx.userId !== 'string') {
    const path = (event as { requestContext?: { path?: string } })?.requestContext?.path;
    logger.warn('Missing or invalid authorizer context', { path });
    throw ApiError.unauthorized('Missing or invalid authentication');
  }

  return {
    userId: ctx.userId,
    email: typeof ctx.email === 'string' ? ctx.email : '',
    role: typeof ctx.role === 'string' ? ctx.role : '',
    rawClaims: { ...ctx },
  };
}
