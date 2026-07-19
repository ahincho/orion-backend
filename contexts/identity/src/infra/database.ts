// =============================================================================
// Kysely Database type for the identity context
// =============================================================================
// Mirrors the `identity.users` table. Kept in sync with migrations under
// /migrations/V001__create_schema_identity.sql, V002__create_users.sql, etc.
// =============================================================================

import type { ColumnType, Generated } from 'kysely';

export type UserRoleDb = 'asesor' | 'supervisor' | 'distribuidor' | 'admin';

export interface UsersTable {
  id: Generated<string>;
  email: string;
  full_name: string;
  password_hash: string;
  role: UserRoleDb;
  active: boolean;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface Database {
  users: UsersTable;
}
