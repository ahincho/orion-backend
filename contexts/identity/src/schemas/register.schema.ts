import { z } from 'zod';

export const RegisterInputSchema = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(255),
  password: z.string().min(8).max(128),
  role: z.enum(['asesor', 'supervisor', 'distribuidor', 'admin']).default('asesor'),
});
export type RegisterInput = z.infer<typeof RegisterInputSchema>;
