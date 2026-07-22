// =============================================================================
// User service - application service
// =============================================================================
// Business logic for user operations: register, authenticate, get by id,
// change password. Emits domain events to EventBridge.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { ApiError } from '@orion/shared/http';
import { makeDomainEvent, type EventPublisher } from '@orion/shared/events';
import { type User, toPublicUser, type PublicUser, type CreateUserInput } from '../domain/user.js';
import { type UserRegisteredEvent, type UserLoggedInEvent } from '../domain/events.js';
import { type UserRepository } from '../infra/user-repository.js';
import { hashPassword, verifyPassword } from '../password-hasher.js';

export interface JwtSigner {
  sign(subject: string, email: string, role: string): Promise<string>;
}

export interface UserService {
  register(input: CreateUserInput): Promise<{ user: PublicUser; token: string }>;
  authenticate(email: string, password: string): Promise<{ user: PublicUser; token: string }>;
  getById(id: string): Promise<PublicUser>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
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
  };
}
