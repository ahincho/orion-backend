// =============================================================================
// Zod schema validator
// =============================================================================
// Wraps safeParse and converts errors to ApiError via ApiError.fromZodError,
// producing one ErrorDetail per Zod issue. Used by build-handler.ts to
// validate request bodies and by consumer Lambdas to validate incoming
// event payloads.
// =============================================================================

import type { ZodSchema } from 'zod';
import { ApiError } from '../http/api-error.js';

export function validatePayload<T>(schema: ZodSchema<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw ApiError.fromZodError(result.error);
  }
  return result.data;
}