// =============================================================================
// List users query schema (GET /v1/users)
// =============================================================================
// Combines pagination with optional role and active filters. `role` is a
// comma-separated list (e.g. "advisor,supervisor") so callers can narrow
// by multiple roles in a single request; if omitted, no role filter is
// applied. `active` accepts "true"/"false" (case-insensitive) via the
// standard Zod boolean coercion.
// =============================================================================

import { z } from 'zod';
import { PaginationQuerySchema } from './pagination.schema.js';
import { USER_ROLES, type UserRole } from '../domain/user.js';

export const ListUsersQuerySchema = PaginationQuerySchema.extend({
  role: z
    .string()
    .optional()
    .transform((raw) => {
      if (!raw) return undefined;
      const values = raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0);
      const invalid = values.filter((v) => !USER_ROLES.includes(v as UserRole));
      if (invalid.length > 0) {
        throw new Error(`invalid role value(s): ${invalid.join(', ')}`);
      }
      return values as UserRole[];
    }),
  active: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
});
export type ListUsersQuery = z.output<typeof ListUsersQuerySchema>;