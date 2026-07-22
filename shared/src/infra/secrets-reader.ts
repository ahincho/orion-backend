// =============================================================================
// Secrets Manager reader with 5-minute in-memory cache
// =============================================================================
// Use for JWT signing keys, DB credentials, and any other sensitive config.
// ARN is read once via SSM (the ARN itself is not a secret) and then the
// secret value is fetched and cached.
//
// All AWS SDK failures are surfaced as ApiError.awsUnavailable so callers
// receive a structured ErrorDetail (code: aws.unavailable, meta.dependency).
// Missing required secrets are surfaced as ApiError.internal because they
// indicate a deploy/configuration bug, not an availability incident.
// =============================================================================

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { ApiError } from '../http/api-error.js';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface SecretsReaderConfig {
  region?: string;
  cacheTtlMs?: number;
}

export interface SecretsReader {
  getString(secretArn: string): Promise<string | undefined>;
  getRequiredString(secretArn: string): Promise<string>;
  getJson<T>(secretArn: string): Promise<T>;
  invalidate(secretArn?: string): void;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export function createSecretsReader(config: SecretsReaderConfig = {}): SecretsReader {
  const region = config.region ?? process.env.AWS_REGION;
  const client = region ? new SecretsManagerClient({ region }) : new SecretsManagerClient({});
  const ttl = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  function getCached(arn: string): string | undefined {
    const entry = cache.get(arn);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      cache.delete(arn);
      return undefined;
    }
    return entry.value;
  }

  function setCached(arn: string, value: string): void {
    cache.set(arn, { value, expiresAt: Date.now() + ttl });
  }

  async function getString(secretArn: string): Promise<string | undefined> {
    const cached = getCached(secretArn);
    if (cached !== undefined) return cached;

    let result;
    try {
      result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    } catch (err) {
      throw ApiError.awsUnavailable('Secrets Manager', err);
    }
    const value = result.SecretString;
    if (value !== undefined) {
      setCached(secretArn, value);
    }
    return value;
  }

  async function getRequiredString(secretArn: string): Promise<string> {
    const value = await getString(secretArn);
    if (value === undefined) {
      throw new ApiError(500, `Required secret not found or empty: ${secretArn}`, {
        details: {
          code: 'config.secret_missing',
          message: `Required secret not found or empty: ${secretArn}`,
          path: secretArn,
        },
      });
    }
    return value;
  }

  async function getJson<T>(secretArn: string): Promise<T> {
    const raw = await getRequiredString(secretArn);
    return JSON.parse(raw) as T;
  }

  function invalidate(secretArn?: string): void {
    if (secretArn) cache.delete(secretArn);
    else cache.clear();
  }

  return { getString, getRequiredString, getJson, invalidate };
}