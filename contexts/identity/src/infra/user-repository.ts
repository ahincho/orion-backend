// =============================================================================
// User repository - typed CRUD via kysely
// =============================================================================
// Interface-driven factory for testability (services depend on the
// interface, not the concrete implementation). All kysely calls are wrapped
// with withDbErrorMapping so any driver-level failure surfaces as
// ApiError.dbUnavailable (code: db.unavailable, meta.operation).
// =============================================================================

import type { Kysely } from 'kysely';
import { withDbErrorMapping } from '@orion/shared/infra';
import type { Database } from './database.js';
import { type CreateUserInput, type User, type UserRole } from '../domain/user.js';

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  findById(id: string): Promise<User | null>;
  create(input: CreateUserInput & { id: string; passwordHash: string }): Promise<User>;
  updatePassword(id: string, newPasswordHash: string): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
  list(input: ListUsersFilter): Promise<{ items: User[]; total: number }>;
  update(id: string, input: UpdateUserFields): Promise<User>;
  setActive(id: string, active: boolean): Promise<User>;
}

export interface ListUsersFilter {
  /** Restrict results to users whose role is in this set. Omit = no role filter. */
  roles?: readonly UserRole[];
  /** Restrict to active=true|false. Omit = no active filter. */
  active?: boolean;
  /** 1-indexed page number. */
  page: number;
  /** Items per page (server-clamped). */
  perPage: number;
}

export interface UpdateUserFields {
  email?: string;
  fullName?: string;
  role?: UserRole;
  active?: boolean;
}

interface UserRow {
  id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: 'advisor' | 'supervisor' | 'agent';
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
      return withDbErrorMapping('users.findByEmail', async () => {
        const row = await db
          .selectFrom('users')
          .selectAll()
          .where('email', '=', email.toLowerCase())
          .executeTakeFirst();
        return row ? mapRowToUser(row) : null;
      });
    },

    async findById(id: string) {
      return withDbErrorMapping('users.findById', async () => {
        const row = await db
          .selectFrom('users')
          .selectAll()
          .where('id', '=', id)
          .executeTakeFirst();
        return row ? mapRowToUser(row) : null;
      });
    },

    async create(input) {
      return withDbErrorMapping('users.create', async () => {
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
      });
    },

    async updatePassword(id, newPasswordHash) {
      await withDbErrorMapping('users.updatePassword', async () => {
        await db
          .updateTable('users')
          .set({ password_hash: newPasswordHash, updated_at: new Date() })
          .where('id', '=', id)
          .execute();
      });
    },

    async existsByEmail(email) {
      return withDbErrorMapping('users.existsByEmail', async () => {
        const row = await db
          .selectFrom('users')
          .select('id')
          .where('email', '=', email.toLowerCase())
          .executeTakeFirst();
        return row !== undefined;
      });
    },

    async list(input: ListUsersFilter) {
      return withDbErrorMapping('users.list', async () => {
        const offset = (input.page - 1) * input.perPage;

        // Build a shared expression tree for WHERE so list + count stay in sync.
        let base = db.selectFrom('users').selectAll();
        if (input.roles && input.roles.length > 0) {
          base = base.where('role', 'in', [...input.roles]);
        }
        if (input.active !== undefined) {
          base = base.where('active', '=', input.active);
        }

        const [rows, totalRow] = await Promise.all([
          base
            .orderBy('created_at', 'desc')
            .limit(input.perPage)
            .offset(offset)
            .execute(),
          base
            .clearSelect()
            .select((eb) => eb.fn.countAll<number>().as('total'))
            .executeTakeFirst(),
        ]);

        const total = Number(totalRow?.total ?? 0);
        return { items: rows.map(mapRowToUser), total };
      });
    },

    async update(id: string, input: UpdateUserFields) {
      return withDbErrorMapping('users.update', async () => {
        const patch: Record<string, unknown> = { updated_at: new Date() };
        if (input.email !== undefined) patch['email'] = input.email.toLowerCase();
        if (input.fullName !== undefined) patch['full_name'] = input.fullName;
        if (input.role !== undefined) patch['role'] = input.role;
        if (input.active !== undefined) patch['active'] = input.active;

        const row = await db
          .updateTable('users')
          .set(patch)
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return mapRowToUser(row);
      });
    },

    async setActive(id: string, active: boolean) {
      return withDbErrorMapping('users.setActive', async () => {
        const row = await db
          .updateTable('users')
          .set({ active, updated_at: new Date() })
          .where('id', '=', id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return mapRowToUser(row);
      });
    },
  };
}