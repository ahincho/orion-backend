import { describe, it, expect, vi } from 'vitest';
import { createCensusService } from '../src/service/census-service.js';
import type { HomeRepository } from '../src/infra/home-repository.js';
import type { AssignmentRepository } from '../src/infra/assignment-repository.js';
import type { EventPublisher } from '@orion/shared/events';
import type { Home } from '../src/domain/home.js';
import type { Assignment } from '../src/domain/assignment.js';

function makeHome(overrides: Partial<Home> = {}): Home {
  return {
    id: 'h-1',
    externalId: 'EXT-001',
    countryCode: 'GT',
    department: 'Guatemala',
    municipality: 'Mixco',
    address: 'Calle 1',
    coordinates: [-90.5, 14.6],
    hasInterest: true,
    assignedTo: null,
    assignedAt: null,
    lastVisitAt: null,
    metadata: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeDeps(
  opts: {
    home?: Home | null;
    existingAssignment?: Assignment | null;
  } = {},
) {
  const homeRepository: HomeRepository = {
    findById: vi.fn().mockResolvedValue(opts.home ?? null),
    findByExternalId: vi.fn().mockResolvedValue(opts.home ?? null),
    listByCountry: vi.fn().mockResolvedValue([]),
    listUnassignedWithInterest: vi.fn().mockResolvedValue(opts.home ? [opts.home] : []),
    listAssignedTo: vi.fn().mockResolvedValue([]),
    setAssignedTo: vi.fn().mockResolvedValue(undefined),
  };

  const assignmentRepository: AssignmentRepository = {
    create: vi.fn().mockImplementation(async (input) => ({
      id: 'a-1',
      homeId: input.homeId,
      assigneeId: input.assigneeId,
      assignedBy: input.assignedBy,
      scheduledDate: input.scheduledDate,
      status: 'pending' as const,
      notes: input.notes ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    findById: vi.fn().mockResolvedValue(opts.existingAssignment ?? null),
    findByHomeAndDate: vi.fn().mockResolvedValue(opts.existingAssignment ?? null),
    listByAssigneeAndDateRange: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue(undefined),
  };

  const eventPublisher: EventPublisher = {
    publish: vi.fn().mockResolvedValue(undefined),
    publishMany: vi.fn().mockResolvedValue(undefined),
  };

  return { homeRepository, assignmentRepository, eventPublisher };
}

describe('censusService.assignHome', () => {
  it('creates an assignment and emits CensusAssigned event', async () => {
    const home = makeHome();
    const deps = makeDeps({ home });
    const service = createCensusService(deps);

    const result = await service.assignHome({
      homeId: 'h-1',
      assigneeId: 'u-99',
      assignedBy: 'u-supervisor',
      scheduledDate: '2026-07-20',
    });

    expect(result.id).toBe('a-1');
    expect(result.status).toBe('pending');
    expect(deps.assignmentRepository.create).toHaveBeenCalled();
    expect(deps.homeRepository.setAssignedTo).toHaveBeenCalledWith('h-1', 'u-99');
    expect(deps.eventPublisher.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'orion.census',
        detailType: 'CensusAssigned',
      }),
    );
  });

  it('returns existing assignment on idempotent re-call (same home+date)', async () => {
    const home = makeHome();
    const existing: Assignment = {
      id: 'a-existing',
      homeId: 'h-1',
      assigneeId: 'u-77',
      assignedBy: 'u-supervisor',
      scheduledDate: '2026-07-20',
      status: 'pending',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const deps = makeDeps({ home, existingAssignment: existing });
    const service = createCensusService(deps);

    const result = await service.assignHome({
      homeId: 'h-1',
      assigneeId: 'u-99',
      assignedBy: 'u-supervisor',
      scheduledDate: '2026-07-20',
    });

    expect(result.id).toBe('a-existing');
    expect(deps.assignmentRepository.create).not.toHaveBeenCalled();
    expect(deps.eventPublisher.publish).not.toHaveBeenCalled();
  });

  it('returns 404 when home does not exist', async () => {
    const deps = makeDeps({ home: null });
    const service = createCensusService(deps);

    await expect(
      service.assignHome({
        homeId: 'nonexistent',
        assigneeId: 'u-99',
        assignedBy: 'u-supervisor',
        scheduledDate: '2026-07-20',
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: 'not_found' });
  });
});

describe('censusService.listUnassignedWithInterest', () => {
  it('returns public homes (excludes metadata and timestamps)', async () => {
    const home = makeHome();
    const deps = makeDeps({ home });
    const service = createCensusService(deps);

    const result = await service.listUnassignedWithInterest(10);

    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('metadata');
    expect(result[0]).not.toHaveProperty('passwordHash');
    expect(result[0]?.id).toBe('h-1');
  });
});

describe('censusService.updateAssignmentStatus', () => {
  it('updates status of an existing assignment', async () => {
    const assignment: Assignment = {
      id: 'a-1',
      homeId: 'h-1',
      assigneeId: 'u-99',
      assignedBy: 'u-supervisor',
      scheduledDate: '2026-07-20',
      status: 'pending',
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const deps = makeDeps({ existingAssignment: assignment });
    const service = createCensusService(deps);

    await expect(service.updateAssignmentStatus('a-1', 'completed')).resolves.toBeUndefined();
    expect(deps.assignmentRepository.updateStatus).toHaveBeenCalledWith('a-1', 'completed');
  });

  it('returns 404 when assignment does not exist', async () => {
    const deps = makeDeps({ existingAssignment: null });
    const service = createCensusService(deps);

    await expect(service.updateAssignmentStatus('nonexistent', 'completed')).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
  });
});
