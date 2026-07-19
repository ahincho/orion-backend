// =============================================================================
// buildHandler - Middy pipeline factory for ORION Lambda handlers
// =============================================================================
// Responsibilities (in order):
//   1. httpHeaderNormalizer  - lowercase keys, strip Content-Length
//   2. jsonBodyParser        - parse event.body string -> object
//   3. injectLambdaContext   - Powertools: correlationId, requestId
//   4. captureLambdaHandler  - X-Ray subsegments
//   5. requireAuth (opt)     - extracts AuthContext, throws 401 if missing
//   6. validateInput (auto)  - Zod schema validation of inputSchema
//   7. CORS                  - dynamic origins from SSM
//   8. httpErrorHandler      - catch thrown ApiError -> formatError
//
// Handlers receive (input, event, auth?) and return a typed payload.
// =============================================================================

import middy from '@middy/core';
import cors from '@middy/http-cors';
import httpErrorHandler from '@middy/http-error-handler';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import jsonBodyParser from '@middy/http-json-body-parser';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ZodSchema } from 'zod';
import { type AuthContext, requireAuth } from '../auth/index.js';
import { getCorsOptions } from '../cors/cors-origins.js';
import { ApiError, formatError, formatResponse } from '../http/index.js';
import { validatePayload } from '../events/schema-validator.js';

export type Handler<TInput, TOutput> = (
  input: TInput,
  event: APIGatewayProxyEventV2,
  auth: AuthContext | undefined,
) => Promise<TOutput>;

export interface HandlerConfig<TInput, TOutput> {
  /** Zod schema for request body validation. */
  inputSchema: ZodSchema<TInput>;
  /** The business logic. */
  handler: Handler<TInput, TOutput>;
  /** Logger instance (per-context). */
  logger: Logger;
  /** Tracer instance (per-context). */
  tracer: Tracer;
  /** When true, the event must carry a Lambda Authorizer context. */
  requireAuth?: boolean;
  /** When true (default), enable CORS with origins from SSM. */
  enableCors?: boolean;
}

/**
 * Builds a Middy-wrapped Lambda handler with the standard ORION pipeline.
 * Returns the wrapped handler ready to export from a `handlers/<name>.ts`.
 */
export function buildHandler<TInput, TOutput>(
  config: HandlerConfig<TInput, TOutput>,
): middy.MiddyfiedHandler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> {
  const baseHandler: middy.HandlerLambda<APIGatewayProxyEventV2, APIGatewayProxyResultV2> = async (
    event,
  ) => {
    try {
      // Parse + validate input
      const rawBody = (event.body ? JSON.parse(event.body) : {}) as unknown;
      const input = validatePayload(config.inputSchema, rawBody);

      // Extract auth context if required
      const auth = config.requireAuth ? requireAuth(event, config.logger) : undefined;

      // Invoke business logic
      const result = await config.handler(input, event, auth);

      // Format success response
      const requestId = event.requestContext?.requestId ?? 'unknown';
      return {
        statusCode: 200,
        body: JSON.stringify(formatResponse(result, requestId)),
        headers: { 'Content-Type': 'application/json' },
      };
    } catch (err) {
      const requestId = event.requestContext?.requestId ?? 'unknown';
      const statusCode = err instanceof ApiError ? err.statusCode : 500;
      return {
        statusCode,
        body: JSON.stringify(formatError(err, requestId)),
        headers: { 'Content-Type': 'application/json' },
      };
    }
  };

  let pipeline = middy(baseHandler)
    .use(httpHeaderNormalizer())
    .use(jsonBodyParser())
    .use(injectLambdaContext(config.logger, { clearState: true }))
    .use(captureLambdaHandler(config.tracer));

  // CORS is async (reads SSM). The Middy v6 cors middleware accepts
  // options inline; we resolve them at cold start via Promise.resolve.
  if (config.enableCors !== false) {
    const corsOptionsPromise = getCorsOptions();
    pipeline = pipeline.use(
      cors({
        origin: corsOptionsPromise.then((o) => o.origin),
        credentials: corsOptionsPromise.then((o) => o.credentials),
        headers: corsOptionsPromise.then((o) => o.headers),
        methods: corsOptionsPromise.then((o) => o.methods),
      }),
    );
  }

  pipeline = pipeline.use(httpErrorHandler());

  return pipeline;
}
