import { describe, it, expect, vi } from 'vitest';
import { createUserService, type JwtSigner } from '../src/service/user-service.js';
import type { UserRepository } from '../src/infra/user-repository.js';
import type { EventPublisher } from '@orion/shared/events';
import { ApiError } from '@orion/shared/http';
import { verifyPassword } from '../src/password-hasher.js';
import type { User } from '../src/domain/user.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'alice@example.com',
    fullName: 'Alice',
    passwordHash: 'scrypt$16384$8$1$abc$def',
    role: 'asesor',
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(
  opts: {
    existingUser?: User | null;
    passwordValid?: boolean;
  } = {},
) {
  const userRepository: UserRepository = {
    findByEmail: vi.fn().mockResolvedValue(opts.existingUser ?? null),
    findById: vi.fn().mockResolvedValue(opts.existingUser ?? null),
    create: vi.fn().mockImplementation(async (input) =>
      makeUser({
        id: input.id,
        email: input.email.toLowerCase(),
        fullName: input.fullName,
        role: input.role,
        passwordHash: input.passwordHash,
      }),
    ),
    updatePassword: vi.fn().mockResolvedValue(undefined),
    existsByEmail: vi
      .fn()
      .mockResolvedValue(opts.existingUser !== null && opts.existingUser !== undefined),
  };

  const eventPublisher: EventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishMany: vi.fn().mockResolvedValue(undefined),
  };

  const jwtSigner: JwtSigner = {
    sign: vi.fn().mockResolvedValue('mock.jwt.token'),
  };

  return { userRepository, eventPublisher, jwtSigner };
}

describe('userService.register', () => {
  it('creates a new user and emits UserRegistered', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    const result = await service.register({
      email: 'Alice@Example.com',
      fullName: 'Alice',
      password: 'password123',
      role: 'asesor',
    });

    expect(result.user.id).toBeTruthy();
    expect(result.user.email).toBe('alice@example.com');
    expect(result.token).toBe('mock.jwt.token');
    expect(deps.userRepository.create).toHaveBeenCalled();
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'orion.identity',
        detailType: 'UserRegistered',
      }),
    );
  });

  it('rejects duplicate email', async () => {
    const deps = makeDeps({ existingUser: makeUser({ email: 'taken@example.com' }) });
    const service = createUserService(deps);

    await expect(
      service.register({
        email: 'taken@example.com',
        fullName: 'X',
        password: 'password123',
        role: 'asesor',
      }),
    ).rejects.toThrow(ApiError);
  });

  it('signs JWT with userId, email, role', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    await service.register({
      email: 'b@c.com',
      fullName: 'B',
      password: 'password123',
      role: 'supervisor',
    });

    expect(deps.jwtSigner.sign).toHaveBeenCalledWith(expect.any(String), 'b@c.com', 'supervisor');
  });
});

describe('userService.authenticate', () => {
  it('returns user + token on valid credentials', async () => {
    const user = makeUser();
    const deps = makeDeps({ existingUser: user });
    // Make verifyPassword succeed by stubbing the password-hasher module
    vi.mock('../src/password-hasher.js', async (importOriginal) => {
      // eslint-disable-next-line @typescript-eslint/consistent-type-imports
      const actual = await importOriginal<typeof import('../src/password-hasher.js')>();
      return {
        ...actual,
        verifyPassword: vi.fn().mockResolvedValue(true),
      };
    });

    // Re-import after mock
    const { createUserService: createWithMock } = await import('../src/service/user-service.js');
    const service = createWithMock(deps);

    const result = await service.authenticate('alice@example.com', 'password123');
    expect(result.user.id).toBe('u-1');
    expect(result.token).toBe('mock.jwt.token');
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'orion.identity', detailType: 'UserLoggedIn' }),
    );
  });

  it('rejects unknown user with 401', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    await expect(service.authenticate('unknown@example.com', 'password123')).rejects.toMatchObject({
      statusCode: 401,
      code: 'unauthorized',
    });
  });
});

describe('userService.changePassword', () => {
  it('updates password when current is correct', async () => {
    const user = makeUser();
    const deps = makeDeps({ existingUser: user });
    const service = createUserService(deps);

    vi.mocked(verifyPassword).mockResolvedValueOnce(true);

    await expect(
      service.changePassword('u-1', 'old-password', 'new-password-123'),
    ).resolves.toBeUndefined();
    expect(deps.userRepository.updatePassword).toHaveBeenCalledWith('u-1', expect.any(String));
  });

  it('rejects when current password is wrong', async () => {
    const user = makeUser();
    const deps = makeDeps({ existingUser: user });
    const service = createUserService(deps);

    vi.mocked(verifyPassword).mockResolvedValueOnce(false);

    await expect(service.changePassword('u-1', 'wrong', 'new-password-123')).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(deps.userRepository.updatePassword).not.toHaveBeenCalled();
  });
});
