// =============================================================================
// ApiError - typed HTTP error with static factories
// =============================================================================
// All thrown errors in handlers should be (or wrap) an ApiError. The
// httpErrorHandler middleware in build-handler reads `.statusCode` and
// `.details` to produce the JSON envelope.
// =============================================================================

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable_entity'
  | 'too_many_requests'
  | 'internal'
  | 'service_unavailable';

export interface ApiErrorOptions {
  code?: ApiErrorCode;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details: Record<string, unknown> | undefined;
  public override readonly cause: unknown;

  constructor(statusCode: number, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = options.code ?? defaultCodeForStatus(statusCode);
    this.details = options.details;
    this.cause = options.cause;
  }

  // ---------------------------------------------------------------------------
  // Static factories. Use these in handlers/services instead of `new ApiError`.
  // ---------------------------------------------------------------------------

  static badRequest(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, message, { code: 'bad_request', details });
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, message, { code: 'unauthorized' });
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, message, { code: 'forbidden' });
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, `${resource} not found`, { code: 'not_found' });
  }

  static conflict(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(409, message, { code: 'conflict', details });
  }

  static unprocessable(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(422, message, { code: 'unprocessable_entity', details });
  }

  static tooManyRequests(message = 'Too many requests'): ApiError {
    return new ApiError(429, message, { code: 'too_many_requests' });
  }

  static internal(message = 'Internal server error', cause?: unknown): ApiError {
    return new ApiError(500, message, { code: 'internal', cause });
  }

  static serviceUnavailable(message = 'Service unavailable'): ApiError {
    return new ApiError(503, message, { code: 'service_unavailable' });
  }
}

function defaultCodeForStatus(statusCode: number): ApiErrorCode {
  switch (statusCode) {
    case 400:
      return 'bad_request';
    case 401:
      return 'unauthorized';
    case 403:
      return 'forbidden';
    case 404:
      return 'not_found';
    case 409:
      return 'conflict';
    case 422:
      return 'unprocessable_entity';
    case 429:
      return 'too_many_requests';
    case 503:
      return 'service_unavailable';
    default:
      return 'internal';
  }
}
