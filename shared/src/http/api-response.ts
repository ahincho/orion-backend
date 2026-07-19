// =============================================================================
// HTTP response envelope formatters
// =============================================================================
// Standard JSON envelope for all ORION API responses:
//   { success: true,  data: <payload>, meta: { requestId, timestamp } }
//   { success: false, error: { code, message, details? }, meta: {...} }
//
// The httpErrorHandler middleware in build-handler calls formatError(err)
// when an error is thrown. formatResponse is called on success.
// =============================================================================

import { ApiError } from './api-error.js';

export interface ResponseMeta {
  requestId: string;
  timestamp: string;
}

export interface SuccessEnvelope<T> {
  success: true;
  data: T;
  meta: ResponseMeta;
}

export interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta: ResponseMeta;
}

export function formatResponse<T>(data: T, requestId: string): SuccessEnvelope<T> {
  return {
    success: true,
    data,
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function formatError(err: unknown, requestId: string): ErrorEnvelope {
  if (err instanceof ApiError) {
    return {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Unknown error: do not leak internal details to the client.
  return {
    success: false,
    error: {
      code: 'internal',
      message: 'Internal server error',
    },
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}
