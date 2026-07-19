// =============================================================================
// Password hasher - scrypt (built-in Node crypto)
// =============================================================================
// Format: scrypt$N$r$p$salt$hash (base64url-encoded salt + hash).
// Uses scrypt's default N=16384, r=8, p=1 for balanced security/perf.
// =============================================================================

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

type ScryptAsync = (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options?: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_MAXMEM = 256 * 1024 * 1024;

const scryptAsync: ScryptAsync = (password, salt, keylen, options) =>
  new Promise((resolve, reject) => {
    const opts = options ? { ...options, maxmem: SCRYPT_MAXMEM } : { maxmem: SCRYPT_MAXMEM };
    scrypt(password, salt, keylen, opts, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }
  const salt = randomBytes(SALT_LENGTH);
  const hash = await scryptAsync(plain, salt, KEY_LENGTH, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(plain: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64!, 'base64url');
  const expected = Buffer.from(hashB64!, 'base64url');
  const computed = await scryptAsync(plain, salt, expected.length, { N: n, r, p });
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}
