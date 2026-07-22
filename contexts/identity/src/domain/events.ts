// =============================================================================
// Domain events emitted by the identity context
// =============================================================================
// Zod schemas for the detail payload. Each event has version=1 envelope.
// Source: 'orion.identity'
// =============================================================================

import { z } from 'zod';
import { USER_ROLES } from './user.js';

export const UserRegisteredEventSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(USER_ROLES),
});
export type UserRegisteredEvent = z.infer<typeof UserRegisteredEventSchema>;

export const UserLoggedInEventSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  loginAt: z.string().datetime(),
});
export type UserLoggedInEvent = z.infer<typeof UserLoggedInEventSchema>;

export const UserUpdatedEventSchema = z
  .object({
    userId: z.string().uuid(),
    changedBy: z.string().uuid(),
    updatedAt: z.string().datetime(),
    email: z.string().email().optional(),
    fullName: z.string().optional(),
    role: z.enum(USER_ROLES).optional(),
    previousRole: z.enum(USER_ROLES).optional(),
    active: z.boolean().optional(),
    previousActive: z.boolean().optional(),
  })
  // Only emitted when at least one field actually changed.
  .refine(
    (value) =>
      value.email !== undefined ||
      value.fullName !== undefined ||
      value.role !== undefined ||
      value.active !== undefined,
    { message: 'UserUpdatedEvent must carry at least one changed field' },
  );
export type UserUpdatedEvent = z.infer<typeof UserUpdatedEventSchema>;
