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

  it('throws ApiError.badRequest on invalid input with one ErrorDetail per Zod issue', () => {
    try {
      validatePayload(schema, { email: 'not-an-email', age: -1 });
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(400);
      expect(apiErr.code).toBe('bad_request');
      expect(Array.isArray(apiErr.details)).toBe(true);
      expect(apiErr.details.length).toBeGreaterThan(0);
      for (const detail of apiErr.details) {
        expect(detail.code).toMatch(/^validation\./);
        expect(typeof detail.message).toBe('string');
      }
      expect(apiErr.details.some((d) => d.path === 'email')).toBe(true);
      expect(apiErr.details.some((d) => d.path === 'age')).toBe(true);
    }
  });
});
