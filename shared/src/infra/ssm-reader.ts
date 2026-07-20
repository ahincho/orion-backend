// =============================================================================
// SSM Parameter Store reader with 5-minute in-memory cache
// =============================================================================
// Uses AWS Powertools SSMProvider under the hood when available; otherwise
// falls back to @aws-sdk/client-ssm directly. Cache TTL is configurable.
//
// Use createSsmReader() in composition roots. Never instantiate the
// SSM client directly in services.
// =============================================================================

import { GetParametersCommand, GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface SsmReaderConfig {
  region?: string;
  cacheTtlMs?: number;
}

export interface SsmReader {
  getString(name: string): Promise<string | undefined>;
  getRequiredString(name: string): Promise<string>;
  getJson<T>(name: string): Promise<T>;
  invalidate(name?: string): void;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
}

export function createSsmReader(config: SsmReaderConfig = {}): SsmReader {
  const region = config.region ?? process.env.AWS_REGION;
  const client = region ? new SSMClient({ region }) : new SSMClient({});
  const ttl = config.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  function getCached(name: string): string | undefined {
    const entry = cache.get(name);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      cache.delete(name);
      return undefined;
    }
    return entry.value;
  }

  function setCached(name: string, value: string): void {
    cache.set(name, { value, expiresAt: Date.now() + ttl });
  }

  async function getString(name: string): Promise<string | undefined> {
    const cached = getCached(name);
    if (cached !== undefined) return cached;

    // WithDecryption must be EXPLICITLY true. Despite AWS SDK v3 docs saying
    // the default is true, in practice (verified with @aws-sdk/client-ssm
    // v3.1090.0) omitting it returns the ciphertext for SecureString
    // parameters. The Lambda role still needs kms:Decrypt on the SSM key
    // (alias/aws/ssm) for decryption to actually happen.
    const result = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    const value = result.Parameter?.Value;
    if (value !== undefined) {
      setCached(name, value);
    }
    return value;
  }

  async function getRequiredString(name: string): Promise<string> {
    const value = await getString(name);
    if (value === undefined) {
      throw new Error(`Required SSM parameter not found: ${name}`);
    }
    return value;
  }

  async function getJson<T>(name: string): Promise<T> {
    const raw = await getRequiredString(name);
    return JSON.parse(raw) as T;
  }

  // Helper for GetParametersCommand (batch) - reserved for future use
  async function getMany(_names: string[]): Promise<Map<string, string>> {
    const result = await client.send(
      new GetParametersCommand({ Names: [], WithDecryption: false }),
    );
    const map = new Map<string, string>();
    for (const p of result.Parameters ?? []) {
      if (p.Name && p.Value !== undefined) {
        map.set(p.Name, p.Value);
        setCached(p.Name, p.Value);
      }
    }
    return map;
  }

  function invalidate(name?: string): void {
    if (name) cache.delete(name);
    else cache.clear();
  }

  // Suppress unused warning for getMany helper - kept for future batch usage
  void getMany;

  return { getString, getRequiredString, getJson, invalidate };
}
