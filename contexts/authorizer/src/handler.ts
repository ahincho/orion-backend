// =============================================================================
// Lambda Authorizer handler (REQUEST type)
// =============================================================================
// Receives an event from API Gateway HTTP API v2 with the Authorization
// header as part of the identitySource. Returns:
//   - { isAuthorized: true, context: { userId, email, role } } on success
//   - { isAuthorized: false } on failure
//
// API Gateway attaches the `context` to event.requestContext.authorizer.lambda
// for downstream Lambdas, where build-handler's requireAuth middleware reads it.
// =============================================================================

import type {
  APIGatewayAuthorizerResult,
  APIGatewayAuthorizerWithContextResult,
  APIGatewayRequestAuthorizerEventV2,
} from 'aws-lambda';
import { buildContext } from './composition.js';

export const handler = async (
  event: APIGatewayRequestAuthorizerEventV2,
): Promise<APIGatewayAuthorizerResult | APIGatewayAuthorizerWithContextResult> => {
  const authHeader =
    event.headers?.authorization ?? event.headers?.Authorization ?? event.headers?.AUTHORIZATION;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { isAuthorized: false };
  }

  const token = authHeader.slice(7);
  const ctx = await buildContext();
  const claims = await ctx.verify(token);

  if (!claims) {
    return { isAuthorized: false };
  }

  return {
    isAuthorized: true,
    context: {
      userId: claims.userId,
      email: claims.email,
      role: claims.role,
    },
  };
};
