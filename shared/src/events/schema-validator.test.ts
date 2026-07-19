import { describe, it, expect } from 'vitest';
import { validatePayload } from './schema-validator.js';
import { z } from 'zod';
import { ApiError } from '../http/api-error.js';

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0),
});

describe('validatePayload', () => {
  it('returns parsed payload on valid input', () => {
    const result = validatePayload(schema, { email: 'a@b.com', age: 30 });
    expect(result).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('throws ApiError.badRequest on invalid input', () => {
    try {
      validatePayload(schema, { email: 'not-an-email', age: -1 });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.code).toBe('bad_request');
      const issues = (apiErr.details as { issues: { path: string; message: string }[] }).issues;
      expect(issues.length).toBeGreaterThan(0);
    }
  });
});
