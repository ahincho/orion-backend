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
  // SSM value is a JSON-encoded list (per orion-infrastructure
  // modules/ssm-bootstrap module: "CORS allowed origins se almacena como
  // JSON-encoded list (no CSV) para consumir directo desde el Lambda con
  // JSON.parse"). Parsing as JSON also rejects accidental CSV input that
  // would otherwise produce a one-element list whose single entry is the
  // whole CSV, which the inlineCorsMiddleware would then put verbatim
  // into the Access-Control-Allow-Origin header.
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === 'string')) {
    throw new Error(
      `cors-origins: SSM parameter ${SSM_CORS_KEY} must be a JSON array of strings`,
    );
  }
  cachedOrigins = parsed as string[];
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
