// =============================================================================
// Kysely Database type for the census context
// =============================================================================

import type { ColumnType, Generated } from 'kysely';

export interface HomesTable {
  id: Generated<string>;
  external_id: string;
  country_code: 'GT' | 'HN' | 'CR' | 'NI';
  department: string;
  municipality: string;
  address: string | null;
  // Kysely supports raw geometry types via any; we parse in the repo.
  geom: unknown;
  has_interest: boolean;
  assigned_to: string | null;
  assigned_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  last_visit_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  metadata: Record<string, unknown>;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export type AssignmentStatusDb = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface AssignmentsTable {
  id: Generated<string>;
  home_id: string;
  assignee_id: string;
  assigned_by: string;
  scheduled_date: ColumnType<string, string, string>;
  status: AssignmentStatusDb;
  notes: string | null;
  created_at: ColumnType<Date, Date | string | undefined, never>;
  updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export interface Database {
  homes: HomesTable;
  assignments: AssignmentsTable;
}
