import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password-hasher.js';

describe('hashPassword', () => {
  it('produces a scrypt-formatted string with N$r$p$salt$hash', async () => {
    const encoded = await hashPassword('supersecret');
    expect(encoded.startsWith('scrypt$16384$8$1$')).toBe(true);
    const parts = encoded.split('$');
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe('scrypt');
    expect(parts[4]).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(parts[5]).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    await expect(hashPassword('short')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
    await expect(hashPassword('1234567')).rejects.toThrow(
      'Password must be at least 8 characters',
    );
  });

  it('accepts passwords of exactly 8 characters', async () => {
    const encoded = await hashPassword('12345678');
    expect(encoded.startsWith('scrypt$')).toBe(true);
  });

  it('produces different salts for the same password (non-deterministic)', async () => {
    const a = await hashPassword('supersecret');
    const b = await hashPassword('supersecret');
    expect(a).not.toBe(b);
  });
});

describe('verifyPassword', () => {
  it('verifies a password hashed by hashPassword', async () => {
    const encoded = await hashPassword('supersecret');
    await expect(verifyPassword('supersecret', encoded)).resolves.toBe(true);
  });

  it('rejects a wrong password', async () => {
    const encoded = await hashPassword('supersecret');
    await expect(verifyPassword('wrongpassword', encoded)).resolves.toBe(false);
  });

  it('returns false for malformed encoded string (wrong segment count)', async () => {
    await expect(verifyPassword('x', 'scrypt$1$2$3$4')).resolves.toBe(false);
    await expect(verifyPassword('x', 'scrypt$1$2$3$4$5$6$7')).resolves.toBe(false);
  });

  it('returns false when prefix is not scrypt', async () => {
    await expect(
      verifyPassword('x', 'bcrypt$16384$8$1$abc$def'),
    ).resolves.toBe(false);
  });

  it('returns false when N, r, or p are not finite numbers', async () => {
    await expect(
      verifyPassword('x', 'scrypt$NaN$8$1$abc$def'),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('x', 'scrypt$16384$NaN$1$abc$def'),
    ).resolves.toBe(false);
    await expect(
      verifyPassword('x', 'scrypt$16384$8$NaN$abc$def'),
    ).resolves.toBe(false);
  });

  it('returns false for empty encoded string', async () => {
    await expect(verifyPassword('x', '')).resolves.toBe(false);
  });
});
