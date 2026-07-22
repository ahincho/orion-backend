// =============================================================================
// Paginated response envelope
// =============================================================================
// Standard shape for list endpoints. Pagination metadata is always present
// (page, perPage, total, totalPages) so clients can render pagers without
// inspecting headers. The list query schema lives in each context
// (e.g. contexts/identity/src/schemas/pagination.schema.ts); this file
// provides only the response envelope + a formatter helper.
// =============================================================================

export interface Pagination {
  /** Current page (1-indexed). */
  page: number;
  /** Items per page (server-clamped to [1, maxPerPage]). */
  perPage: number;
  /** Total items matching the query, BEFORE pagination. */
  total: number;
  /** Math.ceil(total / perPage). Always >= 1 (a result with zero items still has 1 page). */
  totalPages: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: Pagination;
}

/**
 * Wrap a raw list of items + total into a PaginatedResponse, computing
 * totalPages from perPage and total. Caller is responsible for clamping
 * page/perPage to valid ranges before calling.
 */
export function buildPaginatedResponse<T>(
  items: T[],
  total: number,
  page: number,
  perPage: number,
): PaginatedResponse<T> {
  const totalPages = perPage > 0 ? Math.max(1, Math.ceil(total / perPage)) : 1;
  return {
    items,
    pagination: { page, perPage, total, totalPages },
  };
}