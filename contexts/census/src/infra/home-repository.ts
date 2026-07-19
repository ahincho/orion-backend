// =============================================================================
// Home repository
// =============================================================================

import { Kysely } from 'kysely';
import type { Database } from './database.js';
import { type Home, type CountryCode } from '../domain/home.js';

export interface HomeRepository {
  findById(id: string): Promise<Home | null>;
  findByExternalId(externalId: string): Promise<Home | null>;
  listByCountry(countryCode: CountryCode, limit: number, offset: number): Promise<Home[]>;
  listUnassignedWithInterest(limit: number): Promise<Home[]>;
  listAssignedTo(userId: string, fromDate: string, toDate: string): Promise<Home[]>;
  setAssignedTo(homeId: string, userId: string | null): Promise<void>;
}

interface HomeRow {
  id: string;
  external_id: string;
  country_code: 'GT' | 'HN' | 'CR' | 'NI';
  department: string;
  municipality: string;
  address: string | null;
  geom: unknown;
  has_interest: boolean;
  assigned_to: string | null;
  assigned_at: Date | null;
  last_visit_at: Date | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function parsePoint(geom: unknown): [number, number] {
  // PostGIS POINT in GeoJSON: { type: 'Point', coordinates: [lng, lat] }
  if (geom && typeof geom === 'object' && 'coordinates' in geom) {
    const coords = (geom as { coordinates: number[] }).coordinates;
    if (Array.isArray(coords) && coords.length >= 2) {
      return [Number(coords[0]), Number(coords[1])];
    }
  }
  return [0, 0];
}

function mapRowToHome(row: HomeRow): Home {
  return {
    id: row.id,
    externalId: row.external_id,
    countryCode: row.country_code,
    department: row.department,
    municipality: row.municipality,
    address: row.address,
    coordinates: parsePoint(row.geom),
    hasInterest: row.has_interest,
    assignedTo: row.assigned_to,
    assignedAt: row.assigned_at,
    lastVisitAt: row.last_visit_at,
    metadata: row.metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createHomeRepository(db: Kysely<Database>): HomeRepository {
  return {
    async findById(id) {
      const row = await db.selectFrom('homes').selectAll().where('id', '=', id).executeTakeFirst();
      return row ? mapRowToHome(row) : null;
    },

    async findByExternalId(externalId) {
      const row = await db
        .selectFrom('homes')
        .selectAll()
        .where('external_id', '=', externalId)
        .executeTakeFirst();
      return row ? mapRowToHome(row) : null;
    },

    async listByCountry(countryCode, limit, offset) {
      const rows = await db
        .selectFrom('homes')
        .selectAll()
        .where('country_code', '=', countryCode)
        .orderBy('created_at', 'desc')
        .limit(limit)
        .offset(offset)
        .execute();
      return rows.map(mapRowToHome);
    },

    async listUnassignedWithInterest(limit) {
      const rows = await db
        .selectFrom('homes')
        .selectAll()
        .where('has_interest', '=', true)
        .where('assigned_to', 'is', null)
        .orderBy('last_visit_at', 'asc')
        .limit(limit)
        .execute();
      return rows.map(mapRowToHome);
    },

    async listAssignedTo(userId, fromDate, toDate) {
      const rows = await db
        .selectFrom('homes')
        .innerJoin('assignments', 'assignments.home_id', 'homes.id')
        .selectAll('homes')
        .where('assignments.assignee_id', '=', userId)
        .where('assignments.scheduled_date', '>=', fromDate)
        .where('assignments.scheduled_date', '<=', toDate)
        .orderBy('assignments.scheduled_date', 'asc')
        .execute();
      return rows.map(mapRowToHome);
    },

    async setAssignedTo(homeId, userId) {
      await db
        .updateTable('homes')
        .set({
          assigned_to: userId,
          assigned_at: userId ? new Date() : null,
          updated_at: new Date(),
        })
        .where('id', '=', homeId)
        .execute();
    },
  };
}
