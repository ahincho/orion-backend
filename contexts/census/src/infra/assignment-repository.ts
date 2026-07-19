// =============================================================================
// Assignment repository
// =============================================================================

import { Kysely } from 'kysely';
import type { Database } from './database.js';
import { type Assignment, type AssignmentStatus } from '../domain/assignment.js';

export interface CreateAssignmentInput {
  homeId: string;
  assigneeId: string;
  assignedBy: string;
  scheduledDate: string;
  notes?: string;
}

export interface AssignmentRepository {
  create(input: CreateAssignmentInput): Promise<Assignment>;
  findById(id: string): Promise<Assignment | null>;
  findByHomeAndDate(homeId: string, scheduledDate: string): Promise<Assignment | null>;
  listByAssigneeAndDateRange(
    assigneeId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Assignment[]>;
  updateStatus(id: string, status: AssignmentStatus): Promise<void>;
}

interface AssignmentRow {
  id: string;
  home_id: string;
  assignee_id: string;
  assigned_by: string;
  scheduled_date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

function mapRowToAssignment(row: AssignmentRow): Assignment {
  return {
    id: row.id,
    homeId: row.home_id,
    assigneeId: row.assignee_id,
    assignedBy: row.assigned_by,
    scheduledDate:
      typeof row.scheduled_date === 'string'
        ? row.scheduled_date
        : new Date(row.scheduled_date).toISOString().slice(0, 10),
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createAssignmentRepository(db: Kysely<Database>): AssignmentRepository {
  return {
    async create(input) {
      const row = await db
        .insertInto('assignments')
        .values({
          home_id: input.homeId,
          assignee_id: input.assigneeId,
          assigned_by: input.assignedBy,
          scheduled_date: input.scheduledDate,
          notes: input.notes ?? null,
          status: 'pending',
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return mapRowToAssignment(row);
    },

    async findById(id) {
      const row = await db
        .selectFrom('assignments')
        .selectAll()
        .where('id', '=', id)
        .executeTakeFirst();
      return row ? mapRowToAssignment(row) : null;
    },

    async findByHomeAndDate(homeId, scheduledDate) {
      const row = await db
        .selectFrom('assignments')
        .selectAll()
        .where('home_id', '=', homeId)
        .where('scheduled_date', '=', scheduledDate)
        .executeTakeFirst();
      return row ? mapRowToAssignment(row) : null;
    },

    async listByAssigneeAndDateRange(assigneeId, fromDate, toDate) {
      const rows = await db
        .selectFrom('assignments')
        .selectAll()
        .where('assignee_id', '=', assigneeId)
        .where('scheduled_date', '>=', fromDate)
        .where('scheduled_date', '<=', toDate)
        .orderBy('scheduled_date', 'asc')
        .execute();
      return rows.map(mapRowToAssignment);
    },

    async updateStatus(id, status) {
      await db
        .updateTable('assignments')
        .set({ status, updated_at: new Date() })
        .where('id', '=', id)
        .execute();
    },
  };
}
