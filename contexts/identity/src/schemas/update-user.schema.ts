// =============================================================================
// Update user schema (PATCH /v1/users/{userId})
// =============================================================================
// Partial update — at least one field must be present. `role` changes are
// authorized at the service layer (only advisor may change roles; never
// self). `email` changes are validated for uniqueness at the service
// layer (existing email -> ApiError.emailTaken).
// =============================================================================

import { z } from 'zod';
import { USER_ROLES } from '../domain/user.js';

export const UpdateUserInputSchema = z
  .object({
    email: z.string().email().max(255).optional(),
    fullName: z.string().min(1).max(255).optional(),
    role: z.enum(USER_ROLES).optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'at least one field must be provided',
  });
export type UpdateUserInput = z.output<typeof UpdateUserInputSchema>;