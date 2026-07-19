// =============================================================================
// Secrets Manager reader with 5-minute in-memory cache
// =============================================================================
// Use for JWT signing keys, DB credentials, and any other sensitive config.
// ARN is read once via SSM (the ARN itself is not a secret) and then the
// secret value is fetched and cached.
// =============================================================================

import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';

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

    try {
      const result = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
      const value = result.SecretString;
      if (value !== undefined) {
        setCached(secretArn, value);
      }
      return value;
    } catch (err) {
      // Re-throw with context for debugging
      throw new Error(`Failed to read secret ${secretArn}: ${(err as Error).message}`);
    }
  }

  async function getRequiredString(secretArn: string): Promise<string> {
    const value = await getString(secretArn);
    if (value === undefined) {
      throw new Error(`Secret not found or empty: ${secretArn}`);
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
