import { describe, it, expect } from 'vitest';
import { signJwt, verifyJwt } from './jwt-helpers.js';
import { ApiError } from '../http/api-error.js';

const SECRET = new TextEncoder().encode('a'.repeat(32)); // 32-byte HS256 secret

describe('signJwt', () => {
  it('produces a valid JWT with subject, email, role, and iss/aud', async () => {
    const token = await signJwt(SECRET, {
      subject: 'u-123',
      email: 'a@b.com',
      role: 'advisor',
    });
    expect(token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
  });

  it('throws if secret is too short', async () => {
    const shortSecret = new TextEncoder().encode('too-short');
    await expect(
      signJwt(shortSecret, { subject: 'u-1', email: 'a@b.com', role: 'r' }),
    ).rejects.toThrow(/32 bytes/);
  });

  it('honors custom expiresInSeconds', async () => {
    const token = await signJwt(SECRET, {
      subject: 'u-1',
      email: 'a@b.com',
      role: 'r',
      expiresInSeconds: 60,
    });
    const claims = await verifyJwt(token, SECRET);
    expect(claims.exp! - claims.iat!).toBe(60);
  });
});

describe('verifyJwt', () => {
  it('returns claims on valid token', async () => {
    const token = await signJwt(SECRET, {
      subject: 'u-abc',
      email: 'x@y.com',
      role: 'supervisor',
    });
    const claims = await verifyJwt(token, SECRET);
    expect(claims.sub).toBe('u-abc');
    expect(claims.email).toBe('x@y.com');
    expect(claims.role).toBe('supervisor');
    expect(claims.iss).toBe('orion-backend');
    expect(claims.aud).toBe('orion-api');
  });

  it('throws ApiError.unauthorized on tampered token', async () => {
    const token = await signJwt(SECRET, { subject: 'u-1', email: 'a@b.com', role: 'r' });
    const tampered = token.slice(0, -2) + 'xx';
    await expect(verifyJwt(tampered, SECRET)).rejects.toThrow(ApiError);
  });

  it('throws ApiError.unauthorized on wrong secret', async () => {
    const token = await signJwt(SECRET, { subject: 'u-1', email: 'a@b.com', role: 'r' });
    const wrongSecret = new TextEncoder().encode('b'.repeat(32));
    await expect(verifyJwt(token, wrongSecret)).rejects.toThrow(ApiError);
  });
});
