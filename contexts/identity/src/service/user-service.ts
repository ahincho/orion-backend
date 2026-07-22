// =============================================================================
// User service - application service
// =============================================================================
// Business logic for user operations: register, authenticate, get by id,
// change password, list/get/update/(de)activate with role-based
// authorization. Emits domain events to EventBridge.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { ApiError, buildPaginatedResponse, type PaginatedResponse } from '@orion/shared/http';
import { type AuthContext } from '@orion/shared/auth';
import { makeDomainEvent, type EventPublisher } from '@orion/shared/events';
import { type User, toPublicUser, type PublicUser, type CreateUserInput, type UserRole } from '../domain/user.js';
import {
  type UserRegisteredEvent,
  type UserLoggedInEvent,
  type UserUpdatedEvent,
} from '../domain/events.js';
import {
  type UserRepository,
  type ListUsersFilter,
  type UpdateUserFields,
} from '../infra/user-repository.js';
import { hashPassword, verifyPassword } from '../password-hasher.js';

export interface JwtSigner {
  sign(subject: string, email: string, role: string): Promise<string>;
}

export interface ListUsersInput {
  /** Pre-authorized role filter (the service may overwrite this for supervisors). */
  roles?: readonly UserRole[];
  active?: boolean;
  page: number;
  perPage: number;
}

export interface UpdateUserServiceInput {
  email?: string;
  fullName?: string;
  role?: UserRole;
  active?: boolean;
}

export interface UserService {
  register(input: CreateUserInput): Promise<{ user: PublicUser; token: string }>;
  authenticate(email: string, password: string): Promise<{ user: PublicUser; token: string }>;
  getById(id: string): Promise<PublicUser>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  listUsers(input: ListUsersInput, requester: AuthContext): Promise<PaginatedResponse<PublicUser>>;
  getUser(id: string, requester: AuthContext): Promise<PublicUser>;
  updateUser(
    id: string,
    input: UpdateUserServiceInput,
    requester: AuthContext,
  ): Promise<PublicUser>;
  deactivateUser(id: string, requester: AuthContext): Promise<PublicUser>;
  activateUser(id: string, requester: AuthContext): Promise<PublicUser>;
}

export interface UserServiceDeps {
  userRepository: UserRepository;
  eventPublisher: EventPublisher;
  jwtSigner: JwtSigner;
}

export function createUserService(deps: UserServiceDeps): UserService {
  const { userRepository, eventPublisher, jwtSigner } = deps;

  async function emitUserRegistered(user: User): Promise<void> {
    const event = makeDomainEvent<UserRegisteredEvent>('orion.identity', 'UserRegistered', {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });
    await eventPublisher.publish(event);
  }

  async function emitUserLoggedIn(user: User): Promise<void> {
    const event = makeDomainEvent<UserLoggedInEvent>('orion.identity', 'UserLoggedIn', {
      userId: user.id,
      email: user.email,
      loginAt: new Date().toISOString(),
    });
    await eventPublisher.publish(event);
  }

  async function emitUserUpdated(
    before: User,
    after: User,
    changedBy: string,
    changedFields: ReadonlyArray<keyof UpdateUserFields>,
  ): Promise<void> {
    const detail: UserUpdatedEvent = {
      userId: after.id,
      changedBy,
      updatedAt: after.updatedAt.toISOString(),
      ...(changedFields.includes('email') ? { email: after.email } : {}),
      ...(changedFields.includes('fullName') ? { fullName: after.fullName } : {}),
      ...(changedFields.includes('role') ? { role: after.role, previousRole: before.role } : {}),
      ...(changedFields.includes('active')
        ? { active: after.active, previousActive: before.active }
        : {}),
    };
    await eventPublisher.publish(
      makeDomainEvent<UserUpdatedEvent>('orion.identity', 'UserUpdated', detail),
    );
  }

  function assertCanManageTarget(requester: AuthContext, target: User): void {
    // advisor: any user
    if (requester.role === 'advisor') return;
    // supervisor: only agent-role targets
    if (requester.role === 'supervisor') {
      if (target.role !== 'agent') {
        throw ApiError.forbidden('Supervisors can only manage agent-role users', {
          code: 'auth.role_mismatch',
          message: 'Supervisors can only manage agent-role users',
          meta: { requiredTargetRole: 'agent', actualTargetRole: target.role },
        });
      }
      return;
    }
    // agent (and any other role): forbidden
    throw ApiError.forbidden('Agent role is not authorized for administrative actions', {
      code: 'auth.role_required',
      message: 'Agent role is not authorized for administrative actions',
      meta: { requiredRoles: ['advisor', 'supervisor'], currentRole: requester.role },
    });
  }

  function assertNotSelfAction(
    requester: AuthContext,
    targetId: string,
    action: 'deactivate' | 'role_change',
  ): void {
    if (requester.userId !== targetId) return;
    if (action === 'deactivate') {
      throw ApiError.forbidden('Self-deactivation is not allowed', {
        code: 'user.self_deactivation',
        message: 'Self-deactivation is not allowed',
        path: 'active',
      });
    }
    throw ApiError.forbidden('Self role change is not allowed', {
      code: 'user.self_role_change',
      message: 'Self role change is not allowed',
      path: 'role',
    });
  }

  return {
    async register(input: CreateUserInput) {
      if (await userRepository.existsByEmail(input.email)) {
        throw ApiError.emailTaken(input.email);
      }
      const id = randomUUID();
      const passwordHash = await hashPassword(input.password);
      const user = await userRepository.create({
        id,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
        password: input.password,
        passwordHash,
      });
      const token = await jwtSigner.sign(user.id, user.email, user.role);
      await emitUserRegistered(user);
      return { user: toPublicUser(user), token };
    },

    async authenticate(email, password) {
      const user = await userRepository.findByEmail(email);
      if (!user || !user.active) {
        throw ApiError.invalidCredentials();
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw ApiError.invalidCredentials();
      }
      const token = await jwtSigner.sign(user.id, user.email, user.role);
      await emitUserLoggedIn(user);
      return { user: toPublicUser(user), token };
    },

    async getById(id) {
      const user = await userRepository.findById(id);
      if (!user) throw ApiError.userNotFound();
      return toPublicUser(user);
    },

    async changePassword(userId, currentPassword, newPassword) {
      const user = await userRepository.findById(userId);
      if (!user) throw ApiError.userNotFound();
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) {
        throw ApiError.unauthorized('Current password is incorrect', {
          code: 'auth.wrong_current_password',
          message: 'Current password is incorrect',
          path: 'currentPassword',
        });
      }
      const newHash = await hashPassword(newPassword);
      await userRepository.updatePassword(userId, newHash);
    },

    async listUsers(input: ListUsersInput, requester: AuthContext) {
      // Authorization: agent cannot list; supervisor is forced to agent role.
      let authorizedRoles = input.roles;
      if (requester.role === 'supervisor') {
        authorizedRoles = ['agent'];
      } else if (requester.role !== 'advisor') {
        throw ApiError.forbidden('Only advisors and supervisors can list users', {
          code: 'auth.role_required',
          message: 'Only advisors and supervisors can list users',
          meta: { requiredRoles: ['advisor', 'supervisor'], currentRole: requester.role },
        });
      }

      const filter: ListUsersFilter = {
        page: input.page,
        perPage: input.perPage,
        ...(authorizedRoles ? { roles: authorizedRoles } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
      };
      const { items, total } = await userRepository.list(filter);
      return buildPaginatedResponse(
        items.map(toPublicUser),
        total,
        input.page,
        input.perPage,
      );
    },

    async getUser(id: string, requester: AuthContext) {
      const user = await userRepository.findById(id);
      if (!user) throw ApiError.userNotFound();
      // Self is always allowed.
      if (requester.userId !== user.id) {
        assertCanManageTarget(requester, user);
      }
      return toPublicUser(user);
    },

    async updateUser(
      id: string,
      input: UpdateUserServiceInput,
      requester: AuthContext,
    ) {
      const before = await userRepository.findById(id);
      if (!before) throw ApiError.userNotFound();

      const isSelf = requester.userId === before.id;
      if (isSelf) {
        // Self can only update fullName + email (no role, no active).
        if (input.role !== undefined) {
          throw input.role !== before.role
            ? ApiError.forbidden('Self role change is not allowed', {
                code: 'user.self_role_change',
                message: 'Self role change is not allowed',
                path: 'role',
              })
            : ApiError.forbidden('Self cannot manage own role', {
                code: 'user.self_managed_field',
                message: 'Self cannot manage own role',
                meta: { field: 'role' },
              });
        }
        if (input.active !== undefined) {
          throw input.active !== before.active
            ? ApiError.forbidden('Self-deactivation is not allowed', {
                code: 'user.self_deactivation',
                message: 'Self-deactivation is not allowed',
                path: 'active',
              })
            : ApiError.forbidden('Self cannot manage own active flag', {
                code: 'user.self_managed_field',
                message: 'Self cannot manage own active flag',
                meta: { field: 'active' },
              });
        }
      } else {
        assertCanManageTarget(requester, before);
      }

      // Email uniqueness check (if changing).
      if (input.email !== undefined && input.email.toLowerCase() !== before.email) {
        if (await userRepository.existsByEmail(input.email)) {
          throw ApiError.emailTaken(input.email);
        }
      }

      const patch: UpdateUserFields = {};
      if (input.email !== undefined) patch.email = input.email;
      if (input.fullName !== undefined) patch.fullName = input.fullName;
      if (input.role !== undefined) patch.role = input.role;
      if (input.active !== undefined) patch.active = input.active;

      const after = await userRepository.update(id, patch);
      const changedFields = Object.keys(patch) as Array<keyof UpdateUserFields>;
      await emitUserUpdated(before, after, requester.userId, changedFields);
      return toPublicUser(after);
    },

    async deactivateUser(id: string, requester: AuthContext) {
      const before = await userRepository.findById(id);
      if (!before) throw ApiError.userNotFound();
      assertNotSelfAction(requester, before.id, 'deactivate');
      assertCanManageTarget(requester, before);
      if (!before.active) return toPublicUser(before);
      const after = await userRepository.setActive(id, false);
      await emitUserUpdated(before, after, requester.userId, ['active']);
      return toPublicUser(after);
    },

    async activateUser(id: string, requester: AuthContext) {
      const before = await userRepository.findById(id);
      if (!before) throw ApiError.userNotFound();
      // Activation is not a self-rule: supervisors/advisors may re-enable
      // a previously-deactivated user (including themselves, if they were
      // deactivated by another admin).
      assertCanManageTarget(requester, before);
      if (before.active) return toPublicUser(before);
      const after = await userRepository.setActive(id, true);
      await emitUserUpdated(before, after, requester.userId, ['active']);
      return toPublicUser(after);
    },
  };
}