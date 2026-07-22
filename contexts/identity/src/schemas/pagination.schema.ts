// =============================================================================
// Pagination query schema (Zod)
// =============================================================================
// Reused by every list endpoint via `.merge()` with endpoint-specific filters.
// Defaults: page=1, perPage=20. Bounds enforced: perPage in [1, 100].
// =============================================================================

import { z } from 'zod';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  perPage: z.coerce.number().int().min(1).max(MAX_PER_PAGE).default(DEFAULT_PER_PAGE),
});
export type PaginationQuery = z.output<typeof PaginationQuerySchema>;