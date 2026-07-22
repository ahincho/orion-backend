import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  GetParameterCommand: vi.fn().mockImplementation(function (input: unknown) {
    return { __type: 'GetParameterCommand', input };
  }),
  GetParametersCommand: vi.fn().mockImplementation(function (input: unknown) {
    return { __type: 'GetParametersCommand', input };
  }),
}));

import { createSsmReader } from './ssm-reader.js';
import { ApiError } from '../http/api-error.js';

describe('createSsmReader', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('getString', () => {
    it('returns the cached value on hit without calling SSM again', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Name: '/orion/x', Value: 'first' } });
      const reader = createSsmReader({ cacheTtlMs: 60_000 });

      const first = await reader.getString('/orion/x');
      const second = await reader.getString('/orion/x');

      expect(first).toBe('first');
      expect(second).toBe('first');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('always passes WithDecryption=true to GetParameterCommand', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'v' } });
      const reader = createSsmReader();
      await reader.getString('/orion/x');
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ input: expect.objectContaining({ Name: '/orion/x', WithDecryption: true }) }),
      );
    });

    it('returns undefined when SSM has no Parameter (not throws)', async () => {
      mockSend.mockResolvedValueOnce({});
      const reader = createSsmReader();
      await expect(reader.getString('/orion/missing')).resolves.toBeUndefined();
    });

    it('maps AWS SDK errors to ApiError.awsUnavailable with SSM dependency', async () => {
      const cause = new Error('AccessDeniedException');
      mockSend.mockRejectedValueOnce(cause);
      const reader = createSsmReader();

      await expect(reader.getString('/orion/x')).rejects.toMatchObject({
        statusCode: 503,
        code: 'service_unavailable',
        cause,
        details: [
          {
            code: 'aws.unavailable',
            message: 'SSM is unavailable',
            meta: { dependency: 'SSM' },
          },
        ],
      });
    });
  });

  describe('getRequiredString', () => {
    it('returns the value when present', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'present' } });
      const reader = createSsmReader();
      await expect(reader.getRequiredString('/orion/x')).resolves.toBe('present');
    });

    it('throws ApiError.internal with config.ssm_missing when parameter is absent', async () => {
      mockSend.mockResolvedValueOnce({});
      const reader = createSsmReader();
      await expect(reader.getRequiredString('/orion/x')).rejects.toMatchObject({
        statusCode: 500,
        code: 'internal',
        details: [
          expect.objectContaining({
            code: 'config.ssm_missing',
            path: '/orion/x',
          }),
        ],
      });
    });
  });

  describe('getJson', () => {
    it('parses the JSON value', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Value: '{"a":1,"b":"x"}' } });
      const reader = createSsmReader();
      await expect(reader.getJson<{ a: number; b: string }>('/orion/x')).resolves.toEqual({
        a: 1,
        b: 'x',
      });
    });
  });

  describe('invalidate', () => {
    it('clears the cache so the next call hits SSM again', async () => {
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'v1' } });
      mockSend.mockResolvedValueOnce({ Parameter: { Value: 'v2' } });
      const reader = createSsmReader();
      expect(await reader.getString('/orion/x')).toBe('v1');
      reader.invalidate();
      expect(await reader.getString('/orion/x')).toBe('v2');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});

describe('ApiError contract (smoke)', () => {
  it('aws.unavailable is always surfaced as 503 service_unavailable', async () => {
    mockSend.mockRejectedValueOnce(new Error('throttled'));
    const reader = createSsmReader();
    try {
      await reader.getString('/orion/x');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(503);
      expect(apiErr.code).toBe('service_unavailable');
      expect(apiErr.details[0]?.code).toBe('aws.unavailable');
    }
  });
});