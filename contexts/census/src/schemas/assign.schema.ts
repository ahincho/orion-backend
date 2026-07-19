import { z } from 'zod';

export const AssignHomeInputSchema = z.object({
  homeId: z.string().uuid(),
  assigneeId: z.string().uuid(),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  notes: z.string().max(500).optional(),
});
export type AssignHomeInput = z.infer<typeof AssignHomeInputSchema>;
