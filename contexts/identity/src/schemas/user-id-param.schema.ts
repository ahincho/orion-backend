// =============================================================================
// Path param schema for /v1/users/{userId}
// =============================================================================
// Validates that the {userId} segment is a UUID v4 (matching the column
// type in identity.users.id). Returning a 400 via validatePayload() is
// cleaner than relying on the DB to surface a "invalid input syntax for
// type uuid" error.
// =============================================================================

import { z } from 'zod';

export const UserIdParamSchema = z.object({
  userId: z.string().uuid(),
});
export type UserIdParam = z.output<typeof UserIdParamSchema>;