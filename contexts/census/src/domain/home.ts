// =============================================================================
// Home - domain entity
// =============================================================================
// Represents a cadastral home with its geographic location and assignment
// metadata. The repository layer maps DB rows to this shape.
// =============================================================================

export type CountryCode = 'GT' | 'HN' | 'CR' | 'NI';

export interface Home {
  id: string;
  externalId: string;
  countryCode: CountryCode;
  department: string;
  municipality: string;
  address: string | null;
  /** [longitude, latitude] per PostGIS POINT convention */
  coordinates: [number, number];
  hasInterest: boolean;
  assignedTo: string | null;
  assignedAt: Date | null;
  lastVisitAt: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicHome {
  id: string;
  externalId: string;
  countryCode: CountryCode;
  department: string;
  municipality: string;
  address: string | null;
  coordinates: [number, number];
  hasInterest: boolean;
  assignedTo: string | null;
  lastVisitAt: string | null;
}

export function toPublicHome(home: Home): PublicHome {
  return {
    id: home.id,
    externalId: home.externalId,
    countryCode: home.countryCode,
    department: home.department,
    municipality: home.municipality,
    address: home.address,
    coordinates: home.coordinates,
    hasInterest: home.hasInterest,
    assignedTo: home.assignedTo,
    lastVisitAt: home.lastVisitAt?.toISOString() ?? null,
  };
}
