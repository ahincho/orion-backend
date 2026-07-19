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

    it('unauthorized returns 401', () => {
      const err = ApiError.unauthorized();
      expect(err.statusCode).toBe(401);
      expect(err.code).toBe('unauthorized');
    });

    it('forbidden returns 403', () => {
      const err = ApiError.forbidden();
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('forbidden');
    });

    it('notFound returns 404 with resource name', () => {
      const err = ApiError.notFound('User');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('not_found');
      expect(err.message).toBe('User not found');
    });

    it('conflict returns 409', () => {
      const err = ApiError.conflict('Duplicate email');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('conflict');
    });

    it('internal returns 500', () => {
      const cause = new Error('db down');
      const err = ApiError.internal('Something went wrong', cause);
      expect(err.statusCode).toBe(500);
      expect(err.code).toBe('internal');
      expect(err.cause).toBe(cause);
    });
  });

  describe('instance', () => {
    it('extends Error and sets name', () => {
      const err = ApiError.badRequest('test');
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('ApiError');
    });
  });
});
