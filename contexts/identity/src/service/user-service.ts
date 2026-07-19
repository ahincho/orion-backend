// =============================================================================
// User service - application service
// =============================================================================
// Business logic for user operations: register, authenticate, get by id,
// change password. Emits domain events to EventBridge.
// =============================================================================

import { randomUUID } from 'node:crypto';
import { ApiError } from '@orion/shared/http';
import {
  type CreateEventBridgeClient,
  makeDomainEvent,
  type EventPublisher,
} from '@orion/shared/events';
import { signJwt } from '@orion/shared/auth';
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
    const event = makeDomainEvent<UserRegisteredEvent>(
      'orion.identity',
      'UserRegistered',
      {
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    );
    await eventPublisher.publish(event);
  }

  async function emitUserLoggedIn(user: User): Promise<void> {
    const event = makeDomainEvent<UserLoggedInEvent>(
      'orion.identity',
      'UserLoggedIn',
      {
        userId: user.id,
        email: user.email,
        loginAt: new Date().toISOString(),
      },
    );
    await eventPublisher.publish(event);
  }

  return {
    async register(input: CreateUserInput) {
      if (await userRepository.existsByEmail(input.email)) {
        throw ApiError.conflict('Email already registered', { email: input.email });
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
        throw ApiError.unauthorized('Invalid credentials');
      }
      const valid = await verifyPassword(password, user.passwordHash);
      if (!valid) {
        throw ApiError.unauthorized('Invalid credentials');
      }
      const token = await jwtSigner.sign(user.id, user.email, user.role);
      await emitUserLoggedIn(user);
      return { user: toPublicUser(user), token };
    },

    async getById(id) {
      const user = await userRepository.findById(id);
      if (!user) throw ApiError.notFound('User');
      return toPublicUser(user);
    },

    async changePassword(userId, currentPassword, newPassword) {
      const user = await userRepository.findById(userId);
      if (!user) throw ApiError.notFound('User');
      const valid = await verifyPassword(currentPassword, user.passwordHash);
      if (!valid) throw ApiError.unauthorized('Current password is incorrect');
      const newHash = await hashPassword(newPassword);
      await userRepository.updatePassword(userId, newHash);
    },
  };
}

// Re-export for callers (avoid circular imports in tests).
export type { CreateEventBridgeClient };
