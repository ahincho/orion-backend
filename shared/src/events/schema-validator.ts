// =============================================================================
// Zod schema validator
// =============================================================================
// Wraps safeParse and converts errors to ApiError.badRequest with rich
// issue details. Used by build-handler.ts to validate request bodies and
// by consumer Lambdas to validate incoming event payloads.
// =============================================================================

import type { ZodSchema, ZodIssue } from 'zod';
import { ApiError } from '../http/api-error.js';

export function validatePayload<T>(schema: ZodSchema<T>, payload: unknown): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw ApiError.badRequest('Validation failed', {
      issues: result.error.issues.map(toIssue),
    });
  }
  return result.data;
}

function toIssue(issue: ZodIssue): Record<string, unknown> {
  return {
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  };
}
