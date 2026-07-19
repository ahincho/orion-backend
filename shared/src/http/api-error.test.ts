import { describe, it, expect } from 'vitest';
import { ApiError } from './api-error.js';

describe('ApiError', () => {
  describe('static factories', () => {
    it('badRequest returns 400 with code bad_request', () => {
      const err = ApiError.badRequest('Invalid input', { field: 'email' });
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('bad_request');
      expect(err.message).toBe('Invalid input');
      expect(err.details).toEqual({ field: 'email' });
    });

    it('badRequest without details omits details', () => {
      const err = ApiError.badRequest('Invalid input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('bad_request');
      expect(err.details).toBeUndefined();
    });

    it('unauthorized returns 401 with default message', () => {
      const err = ApiError.unauthorized();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('unauthorized');
      expect(err.message).toBe('Unauthorized');
    });

    it('unauthorized accepts custom message', () => {
      const err = ApiError.unauthorized('Token expired');
      expect(err.message).toBe('Token expired');
    });

    it('forbidden returns 403 with default message', () => {
      const err = ApiError.forbidden();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('forbidden');
      expect(err.message).toBe('Forbidden');
    });

    it('forbidden accepts custom message', () => {
      const err = ApiError.forbidden('Not allowed');
      expect(err.message).toBe('Not allowed');
    });

    it('notFound returns 404 with resource name', () => {
      const err = ApiError.notFound('User');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('not_found');
      expect(err.message).toBe('User not found');
    });

    it('conflict returns 409 with details', () => {
      const err = ApiError.conflict('Duplicate email', { email: 'a@b.com' });
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('conflict');
      expect(err.details).toEqual({ email: 'a@b.com' });
    });

    it('conflict returns 409 without details', () => {
      const err = ApiError.conflict('Duplicate email');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('conflict');
      expect(err.details).toBeUndefined();
    });

    it('unprocessable returns 422 with details', () => {
      const err = ApiError.unprocessable('Validation failed', { field: 'email' });
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('unprocessable_entity');
      expect(err.details).toEqual({ field: 'email' });
    });

    it('unprocessable returns 422 without details', () => {
      const err = ApiError.unprocessable('Validation failed');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('unprocessable_entity');
      expect(err.details).toBeUndefined();
    });

    it('tooManyRequests returns 429 with default message', () => {
      const err = ApiError.tooManyRequests();
      expect(err.statusCode).toBe(429);
      expect(err.code).toBe('too_many_requests');
      expect(err.message).toBe('Too many requests');
    });

    it('tooManyRequests accepts custom message', () => {
      const err = ApiError.tooManyRequests('Slow down');
      expect(err.message).toBe('Slow down');
    });

    it('internal returns 500 with cause', () => {
      const cause = new Error('db down');
      const err = ApiError.internal('Something went wrong', cause);
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('internal');
      expect(err.cause).toBe(cause);
    });

    it('internal returns 500 without cause', () => {
      const err = ApiError.internal();
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('internal');
      expect(err.cause).toBeUndefined();
      expect(err.message).toBe('Internal server error');
    });

    it('serviceUnavailable returns 503 with default message', () => {
      const err = ApiError.serviceUnavailable();
      expect(err.statusCode).toBe(503);
      expect(err.code).toBe('service_unavailable');
      expect(err.message).toBe('Service unavailable');
    });

    it('serviceUnavailable accepts custom message', () => {
      const err = ApiError.serviceUnavailable('Down for maintenance');
      expect(err.message).toBe('Down for maintenance');
    });
  });

  describe('instance', () => {
    it('extends Error and sets name', () => {
      const err = ApiError.badRequest('test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiError');
    });
  });

  describe('defaultCodeForStatus', () => {
    it('maps 400 to bad_request', () => {
      const err = new ApiError(400, 'msg');
      expect(err.code).toBe('bad_request');
    });

    it('maps 401 to unauthorized', () => {
      const err = new ApiError(401, 'msg');
      expect(err.code).toBe('unauthorized');
    });

    it('maps 403 to forbidden', () => {
      const err = new ApiError(403, 'msg');
      expect(err.code).toBe('forbidden');
    });

    it('maps 404 to not_found', () => {
      const err = new ApiError(404, 'msg');
      expect(err.code).toBe('not_found');
    });

    it('maps 409 to conflict', () => {
      const err = new ApiError(409, 'msg');
      expect(err.code).toBe('conflict');
    });

    it('maps 422 to unprocessable_entity', () => {
      const err = new ApiError(422, 'msg');
      expect(err.code).toBe('unprocessable_entity');
    });

    it('maps 429 to too_many_requests', () => {
      const err = new ApiError(429, 'msg');
      expect(err.code).toBe('too_many_requests');
    });

    it('maps 503 to service_unavailable', () => {
      const err = new ApiError(503, 'msg');
      expect(err.code).toBe('service_unavailable');
    });

    it('maps unknown status to internal', () => {
      const err = new ApiError(500, 'msg');
      expect(err.code).toBe('internal');
    });

    it('maps arbitrary status to internal', () => {
      const err = new ApiError(418, 'msg');
      expect(err.code).toBe('internal');
    });

    it('preserves explicit code override', () => {
      const err = new ApiError(400, 'msg', { code: 'internal' });
      expect(err.code).toBe('internal');
    });

    it('accepts details and cause via options', () => {
      const cause = new Error('root');
      const err = new ApiError(500, 'msg', { details: { k: 'v' }, cause });
      expect(err.details).toEqual({ k: 'v' });
      expect(err.cause).toBe(cause);
    });
  });
});
