import { describe, it, expect, vi } from 'vitest';
import { createUserService, type JwtSigner } from '../src/service/user-service.js';
import type { UserRepository } from '../src/infra/user-repository.js';
import type { EventPublisher } from '@orion/shared/events';
import type { ApiError } from '@orion/shared/http';
import { verifyPassword } from '../src/password-hasher.js';
import type { User } from '../src/domain/user.js';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u-1',
    email: 'alice@example.com',
    fullName: 'Alice',
    passwordHash: 'scrypt$16384$8$1$abc$def',
    role: 'advisor',
    active: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeDeps(
  opts: {
    existingUser?: User | null;
    users?: User[];
    passwordValid?: boolean;
  } = {},
) {
  const seedUsers = opts.users ?? (opts.existingUser ? [opts.existingUser] : []);
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
      .mockImplementation(
        async (email: string) =>
          seedUsers.some((u) => u.email.toLowerCase() === email.toLowerCase()),
      ),
    list: vi.fn().mockImplementation(async (filter) => {
      let items = seedUsers;
      if (filter.roles && filter.roles.length > 0) {
        items = items.filter((u) => filter.roles!.includes(u.role));
      }
      if (filter.active !== undefined) {
        items = items.filter((u) => u.active === filter.active);
      }
      const total = items.length;
      const start = (filter.page - 1) * filter.perPage;
      return { items: items.slice(start, start + filter.perPage), total };
    }),
    update: vi.fn().mockImplementation(async (id, input) => {
      const base = opts.existingUser ?? makeUser({ id });
      return { ...base, ...input, id, updatedAt: new Date() } as User;
    }),
    setActive: vi.fn().mockImplementation(async (id, active) => {
      const base = opts.existingUser ?? makeUser({ id });
      return { ...base, id, active, updatedAt: new Date() } as User;
    }),
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

function authContext(overrides: Partial<{ userId: string; email: string; role: 'advisor' | 'supervisor' | 'agent' }> = {}) {
  const role = overrides.role ?? 'advisor';
  return {
    userId: overrides.userId ?? 'u-advisor',
    email: overrides.email ?? 'advisor@example.com',
    role,
    rawClaims: { sub: overrides.userId ?? 'u-advisor', email: overrides.email ?? 'advisor@example.com', role },
  };
}

describe('userService.register', () => {
  it('creates a new user and emits UserRegistered', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    const result = await service.register({
      email: 'Alice@Example.com',
      fullName: 'Alice',
      password: 'password123',
      role: 'advisor',
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

  it('rejects duplicate email with user.email_taken detail', async () => {
    const deps = makeDeps({
      users: [makeUser({ email: 'taken@example.com' })],
    });
    const service = createUserService(deps);

    await expect(
      service.register({
        email: 'taken@example.com',
        fullName: 'X',
        password: 'password123',
        role: 'advisor',
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'conflict',
      details: [
        {
          code: 'user.email_taken',
          path: 'email',
          value: 'taken@example.com',
        },
      ],
    });
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

  it('rejects unknown user with auth.invalid_credentials detail (synthetic)', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    try {
      await service.authenticate('unknown@example.com', 'password123');
      expect.fail('expected authenticate to throw');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(401);
      expect(apiErr.code).toBe('unauthorized');
      // Synthetic detail from ApiError.unauthorized → factory ApiError.invalidCredentials
      expect(apiErr.details[0]?.message).toBe('Invalid credentials');
    }
  });

  it('rejects getById with user.not_found synthetic detail', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    try {
      await service.getById('nonexistent');
      expect.fail('expected getById to throw');
    } catch (err) {
      const apiErr = err as ApiError;
      expect(apiErr.statusCode).toBe(404);
      expect(apiErr.code).toBe('not_found');
      expect(apiErr.message).toBe('User not found');
      expect(apiErr.details).toEqual([{ code: 'not_found', message: 'User not found' }]);
    }
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
      code: 'unauthorized',
      details: [
        {
          code: 'auth.wrong_current_password',
          path: 'currentPassword',
        },
      ],
    });
    expect(deps.userRepository.updatePassword).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Administrative endpoints (Stage 3): listUsers / getUser / updateUser /
// deactivateUser / activateUser. Authorization matrix:
//
//   listUsers:    advisor (any) | supervisor (forced agent) | agent 403
//   getUser:      advisor (any) | supervisor (agent only) | agent (self only)
//   updateUser:   advisor (any, no self role/active) | supervisor (agent only)
//                 | agent (self fullName/email only)
//   deactivate:   advisor (no self) | supervisor (agent only, no self) | agent 403
//   activate:     advisor (any) | supervisor (agent only) | agent 403
//
// Self rules (all roles):
//   - no self-deactivation
//   - no self role change
// ============================================================================

describe('userService.listUsers', () => {
  const seed = () => [
    makeUser({ id: 'a-1', email: 'advisor@x.com', role: 'advisor' }),
    makeUser({ id: 's-1', email: 'sup@x.com', role: 'supervisor' }),
    makeUser({ id: 'g-1', email: 'agent1@x.com', role: 'agent' }),
    makeUser({ id: 'g-2', email: 'agent2@x.com', role: 'agent', active: false }),
  ];

  it('returns paginated results for an advisor (preserves requested filters)', async () => {
    const deps = makeDeps({ users: seed() });
    const service = createUserService(deps);

    const page = await service.listUsers(
      { page: 1, perPage: 20, roles: ['advisor', 'supervisor'] },
      authContext({ role: 'advisor' }),
    );

    expect(page.items.map((u) => u.role).sort()).toEqual(['advisor', 'supervisor']);
    expect(page.pagination).toEqual({ page: 1, perPage: 20, total: 2, totalPages: 1 });
    expect(deps.userRepository.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      roles: ['advisor', 'supervisor'],
    });
  });

  it('forces supervisor to agent role regardless of requested filter', async () => {
    const deps = makeDeps({ users: seed() });
    const service = createUserService(deps);

    await service.listUsers(
      { page: 1, perPage: 20, roles: ['advisor'] }, // supervisor asks for advisors
      authContext({ role: 'supervisor' }),
    );

    expect(deps.userRepository.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      roles: ['agent'],
    });
  });

  it('forbids agent role from listing', async () => {
    const deps = makeDeps({ users: seed() });
    const service = createUserService(deps);

    await expect(
      service.listUsers({ page: 1, perPage: 20 }, authContext({ role: 'agent' })),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_required' })],
    });
    expect(deps.userRepository.list).not.toHaveBeenCalled();
  });

  it('respects the active filter', async () => {
    const deps = makeDeps({ users: seed() });
    const service = createUserService(deps);

    await service.listUsers(
      { page: 1, perPage: 20, active: false },
      authContext({ role: 'advisor' }),
    );

    expect(deps.userRepository.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 20,
      active: false,
    });
  });
});

describe('userService.getUser', () => {
  it('returns the user when requester is advisor (any target)', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const result = await service.getUser('g-1', authContext({ role: 'advisor' }));
    expect(result.id).toBe('g-1');
  });

  it('returns the user when requester is self (any role)', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const result = await service.getUser(
      'g-1',
      authContext({ userId: 'g-1', role: 'agent' }),
    );
    expect(result.id).toBe('g-1');
  });

  it('allows supervisor only on agent-role targets', async () => {
    const advisor = makeUser({ id: 'a-1', role: 'advisor' });
    const deps = makeDeps({ existingUser: advisor });
    const service = createUserService(deps);

    await expect(
      service.getUser('a-1', authContext({ role: 'supervisor' })),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_mismatch' })],
    });
  });

  it('forbids agent from reading another agent', async () => {
    const other = makeUser({ id: 'g-2', role: 'agent' });
    const deps = makeDeps({ existingUser: other });
    const service = createUserService(deps);

    await expect(
      service.getUser('g-2', authContext({ userId: 'g-1', role: 'agent' })),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('returns 404 with user.not_found detail when target does not exist', async () => {
    const deps = makeDeps({ existingUser: null });
    const service = createUserService(deps);

    await expect(
      service.getUser('missing', authContext({ role: 'advisor' })),
    ).rejects.toMatchObject({ statusCode: 404, code: 'not_found' });
  });
});

describe('userService.updateUser', () => {
  it('advisor updates any user and emits UserUpdated with changed fields', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const updated = await service.updateUser(
      'g-1',
      { fullName: 'New Name', active: false },
      authContext({ role: 'advisor', userId: 'a-1' }),
    );

    expect(updated.fullName).toBe('New Name');
    expect(updated.active).toBe(false);
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ detailType: 'UserUpdated' }),
    );
  });

  it('supervisor can update only agent-role targets', async () => {
    const advisor = makeUser({ id: 'a-1', role: 'advisor' });
    const deps = makeDeps({ existingUser: advisor });
    const service = createUserService(deps);

    await expect(
      service.updateUser('a-1', { fullName: 'X' }, authContext({ role: 'supervisor' })),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_mismatch' })],
    });
  });

  it('forbids self role change with user.self_role_change detail', async () => {
    const target = makeUser({ id: 'a-1', role: 'advisor' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await expect(
      service.updateUser(
        'a-1',
        { role: 'supervisor' },
        authContext({ userId: 'a-1', role: 'advisor' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'user.self_role_change' })],
    });
  });

  it('forbids self-deactivation with user.self_deactivation detail', async () => {
    const target = makeUser({ id: 'a-1', role: 'advisor', active: true });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await expect(
      service.updateUser(
        'a-1',
        { active: false },
        authContext({ userId: 'a-1', role: 'advisor' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'user.self_deactivation' })],
    });
  });

  it('forbids self from managing own role even when value is unchanged', async () => {
    const target = makeUser({ id: 'a-1', role: 'advisor' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await expect(
      service.updateUser(
        'a-1',
        { role: 'advisor' },
        authContext({ userId: 'a-1', role: 'advisor' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'user.self_managed_field' })],
    });
  });

  it('rejects email change to an existing email with user.email_taken', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', email: 'agent1@x.com' });
    const deps = makeDeps({ existingUser: target });
    deps.userRepository.existsByEmail = vi.fn().mockResolvedValue(true);
    const service = createUserService(deps);

    await expect(
      service.updateUser(
        'g-1',
        { email: 'taken@x.com' },
        authContext({ role: 'advisor' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      details: [expect.objectContaining({ code: 'user.email_taken' })],
    });
  });

  it('self can update own fullName and email (no role, no active)', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', email: 'agent1@x.com' });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const updated = await service.updateUser(
      'g-1',
      { fullName: 'Updated Self', email: 'new@x.com' },
      authContext({ userId: 'g-1', role: 'agent' }),
    );

    expect(updated.fullName).toBe('Updated Self');
    expect(updated.email).toBe('new@x.com');
  });
});

describe('userService.deactivateUser', () => {
  it('advisor deactivates any user (not self) and emits UserUpdated', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', active: true });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const result = await service.deactivateUser(
      'g-1',
      authContext({ role: 'advisor', userId: 'a-1' }),
    );

    expect(result.active).toBe(false);
    expect(deps.userRepository.setActive).toHaveBeenCalledWith('g-1', false);
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({ detailType: 'UserUpdated' }),
    );
  });

  it('supervisor can deactivate only agent-role targets', async () => {
    const advisor = makeUser({ id: 'a-1', role: 'advisor', active: true });
    const deps = makeDeps({ existingUser: advisor });
    const service = createUserService(deps);

    await expect(
      service.deactivateUser('a-1', authContext({ role: 'supervisor' })),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_mismatch' })],
    });
  });

  it('forbids self-deactivation with user.self_deactivation detail', async () => {
    const target = makeUser({ id: 'a-1', role: 'advisor', active: true });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await expect(
      service.deactivateUser(
        'a-1',
        authContext({ userId: 'a-1', role: 'advisor' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'user.self_deactivation' })],
    });
  });

  it('is idempotent: returns current user without emitting event when already inactive', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', active: false });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await service.deactivateUser('g-1', authContext({ role: 'advisor' }));

    expect(deps.userRepository.setActive).not.toHaveBeenCalled();
    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });
});

describe('userService.activateUser', () => {
  it('advisor activates any user', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', active: false });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const result = await service.activateUser(
      'g-1',
      authContext({ role: 'advisor', userId: 'a-1' }),
    );
    expect(result.active).toBe(true);
    expect(deps.userRepository.setActive).toHaveBeenCalledWith('g-1', true);
  });

  it('supervisor can activate only agent-role targets', async () => {
    const advisor = makeUser({ id: 'a-1', role: 'advisor', active: false });
    const deps = makeDeps({ existingUser: advisor });
    const service = createUserService(deps);

    await expect(
      service.activateUser('a-1', authContext({ role: 'supervisor' })),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_mismatch' })],
    });
  });

  it('forbids agent role from activating users', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', active: false });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await expect(
      service.activateUser(
        'g-1',
        authContext({ userId: 'g-2', role: 'agent' }),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      details: [expect.objectContaining({ code: 'auth.role_required' })],
    });
  });

  it('allows an admin to re-activate themselves (no self-rule on activate)', async () => {
    const target = makeUser({ id: 'a-1', role: 'advisor', active: false });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    const result = await service.activateUser(
      'a-1',
      authContext({ userId: 'a-1', role: 'advisor' }),
    );
    expect(result.active).toBe(true);
  });

  it('is idempotent: returns current user without emitting event when already active', async () => {
    const target = makeUser({ id: 'g-1', role: 'agent', active: true });
    const deps = makeDeps({ existingUser: target });
    const service = createUserService(deps);

    await service.activateUser('g-1', authContext({ role: 'advisor' }));

    expect(deps.userRepository.setActive).not.toHaveBeenCalled();
    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });
});
