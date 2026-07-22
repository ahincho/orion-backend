// =============================================================================
// JWT helpers - sign and verify HS256 tokens using `jose`
// =============================================================================
// Used by:
//   - contexts/identity/src/handlers/login.ts      → signJwt() on login
//   - contexts/identity/src/handlers/refresh.ts    → signJwt() on refresh
//   - contexts/authorizer/src/handler.ts           → verifyJwt() per request
//
// The HS256 secret is loaded from AWS Secrets Manager (ARN passed via env
// JWT_SECRET_ARN). The secret MUST be at least 32 bytes for HS256.
// =============================================================================

import { jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { ApiError } from '../http/api-error.js';

export interface OrionJwtClaims extends JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface SignOptions {
  /** Subject (user id). */
  subject: string;
  /** User email. */
  email: string;
  /** User role (e.g. 'advisor', 'supervisor', 'agent'). */
  role: string;
  /** Token lifetime in seconds. Default: 3600 (1 hour). */
  expiresInSeconds?: number;
  /** Additional JWT claims to embed. */
  extraClaims?: Record<string, unknown>;
}

/**
 * Signs a JWT with HS256 using the provided secret.
 * The secret must be at least 32 bytes (256 bits) for HS256.
 */
export async function signJwt(secret: Uint8Array, options: SignOptions): Promise<string> {
  if (secret.byteLength < 32) {
    throw new Error('HS256 secret must be at least 32 bytes');
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = now + (options.expiresInSeconds ?? 3600);

  return new SignJWT({
    email: options.email,
    role: options.role,
    ...(options.extraClaims ?? {}),
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(options.subject)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .setIssuer('orion-backend')
    .setAudience('orion-api')
    .sign(secret);
}

/**
 * Verifies a JWT and returns its claims. Throws ApiError.unauthorized on failure.
 */
export async function verifyJwt(token: string, secret: Uint8Array): Promise<OrionJwtClaims> {
  try {
    const { payload } = await jwtVerify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'orion-backend',
      audience: 'orion-api',
    });

    if (typeof payload.sub !== 'string') {
      throw ApiError.unauthorized('Missing subject claim');
    }

    return payload as OrionJwtClaims;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw ApiError.unauthorized('Invalid or expired token');
  }
}
