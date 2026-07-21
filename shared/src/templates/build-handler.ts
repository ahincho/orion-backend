// =============================================================================
// buildHandler - Middy pipeline factory for ORION Lambda handlers
// =============================================================================
// Responsibilities (in order):
//   1. httpHeaderNormalizer     - lowercase keys, strip Content-Length
//   2. jsonBodyParser           - parse event.body string -> object
//   3. injectLambdaContext      - Powertools: correlationId, requestId
//   4. captureLambdaHandler     - X-Ray subsegments
//   5. requireAuth (optional)   - extracts AuthContext, throws 401 if missing
//   6. validateInput (auto)     - Zod schema validation of inputSchema
//   7. inlineCors (optional)    - dynamic origins from SSM (cached)
//   8. httpErrorHandler         - catch thrown ApiError -> formatError
//
// Handlers receive (input, event, auth?) and return a typed payload.
// =============================================================================

import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpHeaderNormalizer from '@middy/http-header-normalizer';
import type { Logger } from '@aws-lambda-powertools/logger';
import type { Tracer } from '@aws-lambda-powertools/tracer';
import { injectLambdaContext } from '@aws-lambda-powertools/logger/middleware';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ZodTypeAny } from 'zod';
import { type AuthContext, requireAuth } from '../auth/index.js';
import { type CorsOptions, getCorsOptions } from '../cors/cors-origins.js';
import { ApiError, formatError, formatResponse } from '../http/index.js';
import { validatePayload } from '../events/schema-validator.js';

export type Handler<TInput, TOutput> = (
  input: TInput,
  event: APIGatewayProxyEventV2,
  auth: AuthContext | undefined,
) => Promise<TOutput>;

export interface HandlerConfig<TInput, TOutput> {
  /** Zod schema for request body validation. */
  inputSchema: ZodTypeAny;
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

interface ResponseLike {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

const asResponse = (r: unknown): ResponseLike => r as ResponseLike;

/**
 * Inline CORS middleware. Resolves options lazily on first invocation and
 * caches the result. We avoid @middy/http-cors's static-options signature
 * because `getCorsOptions()` is async (reads SSM) and the third-party
 * middleware expects synchronous strings.
 */
function inlineCorsMiddleware(): middy.MiddlewareObj<
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2
> {
  let cached: CorsOptions | undefined;
  let pending: Promise<CorsOptions> | undefined;
  const resolveOnce = (): Promise<CorsOptions> => {
    if (cached) return Promise.resolve(cached);
    if (!pending) {
      pending = getCorsOptions().then((o) => {
        cached = o;
        return o;
      });
    }
    return pending;
  };
  const applyCors = (
    request: middy.Request<APIGatewayProxyEventV2, APIGatewayProxyResultV2>,
  ): void => {
    if (!cached) return;
    const resp = asResponse(request.response);
    const headers = (resp.headers ?? {}) as Record<string, string>;
    const incoming = request.event.headers?.origin ?? request.event.headers?.Origin;
    const allowedOrigin =
      cached.origin.length === 0
        ? '*'
        : cached.origin.length === 1
          ? cached.origin[0]!
          : incoming && cached.origin.includes(incoming)
            ? incoming
            : cached.origin[0]!;
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
    headers['Access-Control-Allow-Credentials'] = String(cached.credentials);
    headers['Access-Control-Allow-Headers'] = cached.headers.join(', ');
    headers['Access-Control-Allow-Methods'] = cached.methods.join(', ');
    resp.headers = headers;
  };
  return {
    before: async (request) => {
      await resolveOnce();
      const method = request.event.requestContext?.http?.method;
      if (method === 'OPTIONS') {
        request.response = {
          statusCode: 204,
          headers: {},
          body: '',
        } as unknown as APIGatewayProxyResultV2;
        applyCors(request);
        return;
      }
    },
    after: async (request) => {
      await resolveOnce();
      applyCors(request);
    },
    onError: async (request) => {
      if (request.response === undefined || request.response === null) return;
      await resolveOnce();
      applyCors(request);
    },
  };
}

/**
 * Builds a Middy-wrapped Lambda handler with the standard ORION pipeline.
 * Returns the wrapped handler ready to export from a `handlers/<name>.ts`.
 */
export function buildHandler<TInput, TOutput>(
  config: HandlerConfig<TInput, TOutput>,
): middy.MiddyfiedHandler<APIGatewayProxyEventV2, APIGatewayProxyResultV2> {
  const baseHandler = async (event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> => {
    try {
      const body = event.body;
      const rawBody =
        body === null || body === undefined
          ? {}
          : typeof body === 'string'
            ? (JSON.parse(body) as unknown)
            : body;
      const input = validatePayload(config.inputSchema, rawBody) as TInput;
      const auth = config.requireAuth ? await requireAuth(event, config.logger) : undefined;
      const result = await config.handler(input, event, auth);
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

  const pipeline = middy<APIGatewayProxyEventV2, APIGatewayProxyResultV2, Error, never>(baseHandler)
    .use(httpHeaderNormalizer())
    .use(injectLambdaContext(config.logger, { clearState: true }))
    .use(captureLambdaHandler(config.tracer));

  if (config.enableCors !== false) {
    pipeline.use(inlineCorsMiddleware());
  }

  pipeline.use(httpErrorHandler());

  return pipeline as unknown as middy.MiddyfiedHandler<
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2
  >;
}
