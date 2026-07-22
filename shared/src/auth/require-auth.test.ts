import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Logger } from '@aws-lambda-powertools/logger';
import type * as JwtHelpers from './jwt-helpers.js';

const mockSsmGetRequiredString = vi.fn();
const mockSecretsGetRequiredString = vi.fn();

vi.mock('../infra/ssm-reader.js', () => ({
  createSsmReader: () => ({
    getString: mockSsmGetRequiredString,
    getRequiredString: mockSsmGetRequiredString,
    getJson: mockSsmGetRequiredString,
    invalidate: vi.fn(),
  }),
}));

vi.mock('../infra/secrets-reader.js', () => ({
  createSecretsReader: () => ({
    getString: mockSecretsGetRequiredString,
    getRequiredString: mockSecretsGetRequiredString,
    getJson: mockSecretsGetRequiredString,
    invalidate: vi.fn(),
  }),
}));

import { ApiError as _ApiError } from '../http/api-error.js';
void _ApiError;

const SILENT_LOGGER = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  appendKeys: vi.fn(),
} as unknown as Logger;

const SECRET_VALUE = 'a'.repeat(64);

beforeEach(() => {
  mockSsmGetRequiredString.mockReset();
  mockSecretsGetRequiredString.mockReset();
  // Bust the module-level JWT secret cache so each test re-reads the secret.
  vi.resetModules();
});

describe('requireAuth (authorizer context path)', () => {
  it('returns AuthContext built from a valid Lambda authorizer context', async () => {
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');
    const event = {
      requestContext: {
        authorizer: {
          lambda: {
            userId: 'u-1',
            email: 'a@b.com',
            role: 'supervisor',
          },
        },
      },
    };
    const auth = await freshRequireAuth(event, SILENT_LOGGER);
    expect(auth.userId).toBe('u-1');
    expect(auth.email).toBe('a@b.com');
    expect(auth.role).toBe('supervisor');
    expect(mockSsmGetRequiredString).not.toHaveBeenCalled();
  });
});

describe('requireAuth (fallback path)', () => {
  it('throws unauthorized with synthetic detail when no Bearer header and no context', async () => {
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');
    const event = { headers: {}, requestContext: { path: '/v1/x' } };
    await expect(freshRequireAuth(event, SILENT_LOGGER)).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
      details: [{ code: 'unauthorized', message: 'Missing or invalid authentication' }],
    });
  });

  it('throws unauthorized with synthetic detail on JWT verification failure', async () => {
    mockSsmGetRequiredString.mockResolvedValue('arn:jwt');
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);
    const { signJwt } = await import('./jwt-helpers.js');
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');

    // Sign with a different secret so verification fails.
    const badToken = await signJwt(
      new TextEncoder().encode('different-secret-also-64-chars-long-aaaaaaaaaaaaaaaaaaaa'),
      { subject: 'u-1', email: 'a@b.com', role: 'advisor' },
    );
    const event = { headers: { authorization: `Bearer ${badToken}` } };
    await expect(freshRequireAuth(event, SILENT_LOGGER)).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
    });
  });

  it('returns AuthContext from a valid Bearer JWT', async () => {
    mockSsmGetRequiredString.mockResolvedValue('arn:jwt');
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);
    const { signJwt } = await import('./jwt-helpers.js');
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');

    const token = await signJwt(new TextEncoder().encode(SECRET_VALUE), {
      subject: 'u-1',
      email: 'a@b.com',
      role: 'advisor',
    });
    const event = { headers: { authorization: `Bearer ${token}` } };
    const auth = await freshRequireAuth(event, SILENT_LOGGER);
    expect(auth.userId).toBe('u-1');
    expect(auth.email).toBe('a@b.com');
    expect(auth.role).toBe('advisor');
  });

  it('throws unauthorized with synthetic detail when JWT lacks subject claim', async () => {
    mockSsmGetRequiredString.mockResolvedValue('arn:jwt');
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);

    // Bypass signJwt by mocking verifyJwt to return claims without sub.
    vi.doMock('./jwt-helpers.js', async () => {
      const actual = await vi.importActual<typeof JwtHelpers>('./jwt-helpers.js');
      return {
        ...actual,
        verifyJwt: vi.fn().mockResolvedValue({ email: 'a@b.com', role: 'advisor' }),
      };
    });
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');
    // Build any non-empty Bearer to pass the prefix check.
    const event = { headers: { authorization: 'Bearer anything.here.verified' } };
    await expect(freshRequireAuth(event, SILENT_LOGGER)).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
    });
    vi.doUnmock('./jwt-helpers.js');
  });

  it('exposes synthetic detail with non-empty details array on every throw', async () => {
    const { requireAuth: freshRequireAuth } = await import('./require-auth.js');
    try {
      await freshRequireAuth({ headers: {} }, SILENT_LOGGER);
      expect.fail('expected requireAuth to throw');
    } catch (err) {
      // After vi.resetModules() ApiError in this file is a distinct class
      // instance from the one in require-auth.ts, so instanceof is unreliable.
      // Assert the contract via the public surface instead.
      expect((err as { code?: string }).code).toBe('unauthorized');
      expect((err as { statusCode?: number }).statusCode).toBe(401);
      const details = (err as { details?: { code: string; message: string }[] }).details;
      expect(Array.isArray(details)).toBe(true);
      expect(details?.length).toBeGreaterThan(0);
      expect(details?.[0]?.code).toBe('unauthorized');
    }
  });
});