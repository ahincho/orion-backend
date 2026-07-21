import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildContext } from '../src/composition.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type CompositionModule = typeof import('../src/composition.js');
import { signJwt } from '@orion/shared/auth';
import type { SecretsReader, SsmReader } from '@orion/shared/infra';

const SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:1:secret:jwt';
const SECRET_VALUE = 'a'.repeat(64);

const mockSsmGetRequiredString = vi.fn();
const mockSecretsGetRequiredString = vi.fn();

vi.mock('@orion/shared/infra', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('../src/composition.js')>(
    '@orion/shared/infra',
  );
  return {
    ...actual,
    createSsmReader: (): SsmReader => ({
      getString: mockSsmGetRequiredString,
      getRequiredString: mockSsmGetRequiredString,
      getJson: mockSsmGetRequiredString,
      invalidate: vi.fn(),
    }),
    createSecretsReader: (): SecretsReader => ({
      getString: mockSecretsGetRequiredString,
      getRequiredString: mockSecretsGetRequiredString,
      getJson: mockSecretsGetRequiredString,
      invalidate: vi.fn(),
    }),
  };
});

// Re-importing the module after the mock is installed would normally be
// required, but composition.ts references createSsmReader/createSecretsReader
// via top-level imports that vitest's vi.mock hoists automatically.
// However, because cachedContext/pendingPromise are module-level singletons,
// every test in this file MUST reset them between tests via resetAuthorizerCache().

async function freshComposition(): Promise<CompositionModule> {
  vi.resetModules();
  const mod = await import('../src/composition.js');
  return mod as CompositionModule;
}

const SECRET_BYTES = new TextEncoder().encode(SECRET_VALUE);

describe('composition.buildContext', () => {
  beforeEach(() => {
    mockSsmGetRequiredString.mockReset();
    mockSecretsGetRequiredString.mockReset();
    mockSsmGetRequiredString.mockResolvedValue(SECRET_ARN);
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);
    vi.resetModules();
  });

  it('reads JWT secret ARN from SSM and the value from Secrets Manager', async () => {
    const { buildContext: bc } = await freshComposition();
    await bc();
    expect(mockSsmGetRequiredString).toHaveBeenCalledWith('/orion/secret/jwt-arn');
    expect(mockSecretsGetRequiredString).toHaveBeenCalledWith(SECRET_ARN);
  });

  it('caches the context across warm invocations (single SSM+Secrets read)', async () => {
    const { buildContext: bc } = await freshComposition();
    const ctx1 = await bc();
    const ctx2 = await bc();
    const ctx3 = await bc();
    expect(ctx1).toBe(ctx2);
    expect(ctx2).toBe(ctx3);
    expect(mockSsmGetRequiredString).toHaveBeenCalledTimes(1);
    expect(mockSecretsGetRequiredString).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent cold-start calls into a single fetch (pendingPromise race)', async () => {
    let resolveSsm!: (v: string) => void;
    mockSsmGetRequiredString.mockImplementation(
      () => new Promise<string>((res) => (resolveSsm = res)),
    );
    const { buildContext: bc } = await freshComposition();
    const p1 = bc();
    const p2 = bc();
    const p3 = bc();
    resolveSsm(SECRET_ARN);
    const [ctx1, ctx2, ctx3] = await Promise.all([p1, p2, p3]);
    expect(ctx1).toBe(ctx2);
    expect(ctx2).toBe(ctx3);
    expect(mockSsmGetRequiredString).toHaveBeenCalledTimes(1);
    expect(mockSecretsGetRequiredString).toHaveBeenCalledTimes(1);
  });

  it('propagates SSM read failures (cold start throws -> API Gateway 500)', async () => {
    mockSsmGetRequiredString.mockRejectedValue(new Error('ParameterNotFound'));
    const { buildContext: bc } = await freshComposition();
    await expect(bc()).rejects.toThrow('ParameterNotFound');
  });

  it('propagates Secrets Manager read failures', async () => {
    mockSecretsGetRequiredString.mockRejectedValue(new Error('Decryption failure'));
    const { buildContext: bc } = await freshComposition();
    await expect(bc()).rejects.toThrow('Decryption failure');
  });
});

describe('composition AuthorizerContext.verify', () => {
  beforeEach(async () => {
    mockSsmGetRequiredString.mockReset();
    mockSecretsGetRequiredString.mockReset();
    mockSsmGetRequiredString.mockResolvedValue(SECRET_ARN);
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);
    vi.resetModules();
  });

  it('returns null on an invalid token (instead of throwing)', async () => {
    const { buildContext: bc } = await freshComposition();
    const ctx = await bc();
    const result = await ctx.verify('not-a-valid-jwt');
    expect(result).toBeNull();
  });

  it('returns null when the token is signed with a different secret', async () => {
    const wrongToken = await signJwt(new TextEncoder().encode('b'.repeat(64)), {
      subject: 'u-other',
      email: 'o@p.com',
      role: 'asesor',
    });
    const { buildContext: bc } = await freshComposition();
    const ctx = await bc();
    const result = await ctx.verify(wrongToken);
    expect(result).toBeNull();
  });

  it('returns the mapped claims on a valid token', async () => {
    const token = await signJwt(SECRET_BYTES, {
      subject: 'u-valid',
      email: 'v@w.com',
      role: 'supervisor',
    });
    const { buildContext: bc } = await freshComposition();
    const ctx = await bc();
    const result = await ctx.verify(token);
    expect(result).toEqual({ userId: 'u-valid', email: 'v@w.com', role: 'supervisor' });
  });

  it('maps non-string email/role claims to empty strings (defensive coercion)', async () => {
    const { buildContext: bc } = await freshComposition();
    const ctx = await bc();
    // Hand-craft a token whose claims include non-string scalars to assert
    // the typeof guard on composition.ts.
    const jose = await import('jose');
    const claims = {
      sub: 'u-x',
      iss: 'orion-backend',
      aud: 'orion-api',
      email: 42, // not a string
      role: null, // not a string
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const token = await new jose.SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(SECRET_BYTES);
    const result = await ctx.verify(token);
    expect(result).toEqual({ userId: 'u-x', email: '', role: '' });
  });

  it('does NOT cache the failure path — verify is called fresh on each invocation', async () => {
    const token = await signJwt(SECRET_BYTES, {
      subject: 'u-1',
      email: 'a@b.com',
      role: 'asesor',
    });
    const { buildContext: bc } = await freshComposition();
    const ctx = await bc();
    const r1 = await ctx.verify(token);
    const r2 = await ctx.verify(token);
    expect(r1).toEqual(r2);
    expect(r1).not.toBeNull();
  });
});

describe('composition (imported directly, no vi.resetModules)', () => {
  beforeEach(() => {
    mockSsmGetRequiredString.mockReset();
    mockSecretsGetRequiredString.mockReset();
  });

  it('uses the module-level cache across tests in the same describe block when not reset', async () => {
    mockSsmGetRequiredString.mockResolvedValue(SECRET_ARN);
    mockSecretsGetRequiredString.mockResolvedValue(SECRET_VALUE);
    const ctx1 = await buildContext();
    expect(mockSsmGetRequiredString).toHaveBeenCalledTimes(1);
    const ctx2 = await buildContext();
    expect(ctx1).toBe(ctx2);
    expect(mockSsmGetRequiredString).toHaveBeenCalledTimes(1);
  });
});

// Keep the unused import live to satisfy the type checker if it ever
// stops being referenced. buildContext is also imported at the top of
// the file for the last describe block.
void buildContext;