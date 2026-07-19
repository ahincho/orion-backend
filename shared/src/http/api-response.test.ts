import { describe, it, expect } from 'vitest';
import { formatError, formatResponse } from './api-response.js';
import { ApiError } from './api-error.js';

describe('formatResponse', () => {
  it('wraps data with success envelope', () => {
    const result = formatResponse({ id: 'u-1', email: 'a@b.com' }, 'req-123');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'u-1', email: 'a@b.com' });
    expect(result.meta.requestId).toBe('req-123');
    expect(result.meta.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('formatError', () => {
  it('formats ApiError with code and details', () => {
    const err = ApiError.badRequest('Invalid email', { field: 'email' });
    const result = formatError(err, 'req-456');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('bad_request');
    expect(result.error.message).toBe('Invalid email');
    expect(result.error.details).toEqual({ field: 'email' });
    expect(result.meta.requestId).toBe('req-456');
  });

  it('hides internal error details from unknown errors', () => {
    const err = new Error('DB password leaked here');
    const result = formatError(err, 'req-789');
    expect(result.success).toBe(false);
    expect(result.error.code).toBe('internal');
    expect(result.error.message).toBe('Internal server error');
    expect(result.error.details).toBeUndefined();
  });

  it('omits details field when ApiError has no details', () => {
    const err = ApiError.unauthorized();
    const result = formatError(err, 'req-abc');
    expect(result.error.code).toBe('unauthorized');
    expect(result.error).not.toHaveProperty('details');
  });
});
