// =============================================================================
// User repository - typed CRUD via kysely
// =============================================================================
// Interface-driven factory for testability (services depend on the
// interface, not the concrete implementation).
// =============================================================================

import type { Kysely } from 'kysely';
import type { Database } from './database.js';
import { type CreateUserInput, type User } from '../domain/user.js';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput & { id: string; passwordHash: string }): Promise<User>;
  updatePassword(id: string, newPasswordHash: string): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'asesor' | 'supervisor' | 'distribuidor' | 'admin';
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

function mapRowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    passwordHash: row.password_hash,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createUserRepository(db: Kysely<Database>): UserRepository {
  return {
    async findByEmail(email: string) {
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('email', '=', email.toLowerCase())
        .executeTakeFirst();
      return row ? mapRowToUser(row) : null;
    },

    async findById(id: string) {
      const row = await db
        .selectFrom('users')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? mapRowToUser(row) : null;
    },

    async create(input) {
      const row = await db
        .insertInto('users')
        .values({
          id: input.id,
          email: input.email.toLowerCase(),
          full_name: input.fullName,
          password_hash: input.passwordHash,
          role: input.role,
          active: true,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return mapRowToUser(row);
    },

    async updatePassword(id, newPasswordHash) {
      await db
        .updateTable('users')
        .set({ password_hash: newPasswordHash, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
    },

    async existsByEmail(email) {
      const row = await db
        .selectFrom('users')
        .select('id')
        .where('email', '=', email.toLowerCase())
        .executeTakeFirst();
      return row !== undefined;
    },
  };
}
