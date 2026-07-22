// =============================================================================
// Domain events emitted by the identity context
// =============================================================================
// Zod schemas for the detail payload. Each event has version=1 envelope.
// Source: 'orion.identity'
// =============================================================================

import { z } from 'zod';

export const UserRegisteredEventSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum(['advisor', 'supervisor', 'promotor']),
});
export type UserRegisteredEvent = z.infer<typeof UserRegisteredEventSchema>;

export const UserLoggedInEventSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  loginAt: z.string().datetime(),
});
export type UserLoggedInEvent = z.infer<typeof UserLoggedInEventSchema>;
