// =============================================================================
// Assignment - daily assignment of a home to a cuadrilla member
// =============================================================================

export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

export interface Assignment {
  id: string;
  homeId: string;
  assigneeId: string;
  assignedBy: string;
  /** ISO date string YYYY-MM-DD */
  scheduledDate: string;
  status: AssignmentStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
