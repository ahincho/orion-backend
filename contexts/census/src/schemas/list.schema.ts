import { z } from 'zod';

export const ListUnassignedQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListUnassignedQuery = z.output<typeof ListUnassignedQuerySchema>;

export const ListAssignedQuerySchema = z.object({
  userId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
});
export type ListAssignedQuery = z.output<typeof ListAssignedQuerySchema>;
