// =============================================================================
// CORS origins - dynamic whitelist from SSM
// =============================================================================
// Reads /orion/cors/allowed-origins from SSM Parameter Store and caches
// the result for 5 minutes. Origins are stored as a comma-separated list:
//   dev:  "http://localhost:4200,http://localhost:3000"
//   prod: "https://orion.example.com,https://admin.orion.example.com"
//
// The CORS middleware in build-handler consumes getCorsOptions() to wire
// the dynamic whitelist into API Gateway responses.
// =============================================================================

import { createSsmReader, type SsmReader } from '../infra/ssm-reader.js';

const SSM_CORS_KEY = '/orion/cors/allowed-origins';
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

export interface CorsOptions {
  origin: string[];
  credentials: boolean;
  headers: string[];
  methods: string[];
  exposeHeaders: string[];
}

let cachedOrigins: string[] | null = null;
let cachedAt = 0;
let ssmRef: SsmReader | null = null;

function getSsm(): SsmReader {
  if (!ssmRef) {
    ssmRef = createSsmReader({ cacheTtlMs: DEFAULT_CACHE_TTL_MS });
  }
  return ssmRef;
}

async function loadOrigins(): Promise<string[]> {
  if (cachedOrigins && Date.now() - cachedAt < DEFAULT_CACHE_TTL_MS) {
    return cachedOrigins;
  }
  const ssm = getSsm();
  const raw = await ssm.getRequiredString(SSM_CORS_KEY);
  cachedOrigins = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  cachedAt = Date.now();
  return cachedOrigins;
}

/** Invalidates the CORS cache. Useful for tests and SSM-triggered refresh. */
export function invalidateCorsCache(): void {
  cachedOrigins = null;
  cachedAt = 0;
}

export async function getCorsOrigins(): Promise<string[]> {
  return loadOrigins();
}

export async function getCorsOptions(): Promise<CorsOptions> {
  const origins = await loadOrigins();
  return {
    origin: origins,
    credentials: true,
    headers: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['X-Correlation-Id'],
  };
}
