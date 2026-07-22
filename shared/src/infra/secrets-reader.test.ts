import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: vi.fn().mockImplementation(function () {
    return { send: mockSend };
  }),
  GetSecretValueCommand: vi.fn().mockImplementation(function (input: unknown) {
    return { __type: 'GetSecretValueCommand', input };
  }),
}));

import { createSecretsReader } from './secrets-reader.js';

describe('createSecretsReader', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  describe('getString', () => {
    it('returns SecretString when present', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'shh' });
      const reader = createSecretsReader();
      await expect(reader.getString('arn:1')).resolves.toBe('shh');
    });

    it('returns undefined when SecretString is missing', async () => {
      mockSend.mockResolvedValueOnce({});
      const reader = createSecretsReader();
      await expect(reader.getString('arn:1')).resolves.toBeUndefined();
    });

    it('maps AWS SDK errors to ApiError.awsUnavailable with Secrets Manager dependency', async () => {
      const cause = new Error('ResourceNotFoundException');
      mockSend.mockRejectedValueOnce(cause);
      const reader = createSecretsReader();

      await expect(reader.getString('arn:1')).rejects.toMatchObject({
        statusCode: 503,
        code: 'service_unavailable',
        cause,
        details: [
          {
            code: 'aws.unavailable',
            message: 'Secrets Manager is unavailable',
            meta: { dependency: 'Secrets Manager' },
          },
        ],
      });
    });

    it('caches by ARN so subsequent reads do not hit Secrets Manager', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'shh' });
      const reader = createSecretsReader({ cacheTtlMs: 60_000 });
      await reader.getString('arn:1');
      await reader.getString('arn:1');
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRequiredString', () => {
    it('returns the value when present', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'present' });
      const reader = createSecretsReader();
      await expect(reader.getRequiredString('arn:1')).resolves.toBe('present');
    });

    it('throws ApiError.internal with config.secret_missing when absent', async () => {
      mockSend.mockResolvedValueOnce({});
      const reader = createSecretsReader();
      await expect(reader.getRequiredString('arn:1')).rejects.toMatchObject({
        statusCode: 500,
        code: 'internal',
        details: [
          expect.objectContaining({
            code: 'config.secret_missing',
            path: 'arn:1',
          }),
        ],
      });
    });
  });

  describe('getJson', () => {
    it('parses the JSON secret', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: '{"token":"abc"}' });
      const reader = createSecretsReader();
      await expect(reader.getJson<{ token: string }>('arn:1')).resolves.toEqual({
        token: 'abc',
      });
    });
  });

  describe('invalidate', () => {
    it('clears cache so next read re-hits Secrets Manager', async () => {
      mockSend.mockResolvedValueOnce({ SecretString: 'v1' });
      mockSend.mockResolvedValueOnce({ SecretString: 'v2' });
      const reader = createSecretsReader();
      expect(await reader.getString('arn:1')).toBe('v1');
      reader.invalidate('arn:1');
      expect(await reader.getString('arn:1')).toBe('v2');
      expect(mockSend).toHaveBeenCalledTimes(2);
    });
  });
});