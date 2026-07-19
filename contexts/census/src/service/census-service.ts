// =============================================================================
// Census service - application service
// =============================================================================
// Business logic: assign homes to cuadrilla members with idempotency check,
// emit CensusAssigned events, list unassigned homes with interest.
// =============================================================================

import { ApiError } from '@orion/shared/http';
import { makeDomainEvent, type EventPublisher } from '@orion/shared/events';
import { type Assignment, type AssignmentStatus } from '../domain/assignment.js';
import { type Home, toPublicHome, type PublicHome } from '../domain/home.js';
import { type CensusAssignedEvent } from '../domain/events.js';
import { type HomeRepository } from '../infra/home-repository.js';
import { type AssignmentRepository } from '../infra/assignment-repository.js';

export interface CensusService {
  listUnassignedWithInterest(limit: number): Promise<PublicHome[]>;
  listAssignedTo(userId: string, fromDate: string, toDate: string): Promise<PublicHome[]>;
  assignHome(input: AssignHomeInput): Promise<Assignment>;
  updateAssignmentStatus(assignmentId: string, status: AssignmentStatus): Promise<void>;
}

export interface AssignHomeInput {
  homeId: string;
  assigneeId: string;
  scheduledDate: string;
  notes?: string;
}

export interface CensusServiceDeps {
  homeRepository: HomeRepository;
  assignmentRepository: AssignmentRepository;
  eventPublisher: EventPublisher;
}

export function createCensusService(deps: CensusServiceDeps): CensusService {
  const { homeRepository, assignmentRepository, eventPublisher } = deps;

  async function emitAssigned(
    assignment: Assignment,
    assignedBy: string,
  ): Promise<void> {
    const event = makeDomainEvent<CensusAssignedEvent>(
      'orion.census',
      'CensusAssigned',
      {
        assignmentId: assignment.id,
        homeId: assignment.homeId,
        assigneeId: assignment.assigneeId,
        assignedBy,
        scheduledDate: assignment.scheduledDate,
      },
    );
    await eventPublisher.publish(event);
  }

  return {
    async listUnassignedWithInterest(limit) {
      const homes = await homeRepository.listUnassignedWithInterest(limit);
      return homes.map(toPublicHome);
    },

    async listAssignedTo(userId, fromDate, toDate) {
      const homes = await homeRepository.listAssignedTo(userId, fromDate, toDate);
      return homes.map(toPublicHome);
    },

    async assignHome(input: AssignHomeInput & { assignedBy: string }) {
      const home = await homeRepository.findById(input.homeId);
      if (!home) throw ApiError.notFound('Home');

      // Idempotency: if there's already an assignment for this home on this date, return it.
      const existing = await assignmentRepository.findByHomeAndDate(input.homeId, input.scheduledDate);
      if (existing) return existing;

      const assignment = await assignmentRepository.create({
        homeId: input.homeId,
        assigneeId: input.assigneeId,
        assignedBy: input.assignedBy,
        scheduledDate: input.scheduledDate,
        notes: input.notes,
      });

      await homeRepository.setAssignedTo(home.id, input.assigneeId);
      await emitAssigned(assignment, input.assignedBy);

      return assignment;
    },

    async updateAssignmentStatus(assignmentId, status) {
      const assignment = await assignmentRepository.findById(assignmentId);
      if (!assignment) throw ApiError.notFound('Assignment');
      await assignmentRepository.updateStatus(assignmentId, status);
    },
  };
}

// Re-export domain types for callers (avoid deep imports in tests).
export type { Home };
