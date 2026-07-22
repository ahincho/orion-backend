// =============================================================================
// User - domain entity
// =============================================================================
// Pure TS interfaces. Zero infrastructure dependencies. The repository
// maps DB rows to these types via mapRowToUser().
// =============================================================================

/**
 * Internal representation of a user (includes password_hash, never sent to clients).
 */
export interface User {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  role: UserRole;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Public representation of a user (safe to send to clients).
 * Excludes password_hash.
 */
export interface PublicUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'advisor' | 'supervisor' | 'agent';

export interface CreateUserInput {
  email: string;
  fullName: string;
  password: string;
  role: UserRole;
}

export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
