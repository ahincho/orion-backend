-- =============================================================================
-- V002__create_census_homes.sql
-- =============================================================================
-- Homes (hogares catastrados). The cadastral geometry is stored as
-- PostGIS geometry(POINT, 4326). The full geographic polygon and
-- additional demographic data live in the legacy sf_hn schema; here we
-- mirror only the fields ORION needs for assignment decisions.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE census.homes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     VARCHAR(64)  NOT NULL UNIQUE,   -- id catastral (techito)
  country_code    CHAR(2)      NOT NULL,          -- GT, HN, CR, NI
  department      VARCHAR(64)  NOT NULL,
  municipality    VARCHAR(64)  NOT NULL,
  address         TEXT,
  geom            GEOMETRY(POINT, 4326) NOT NULL,
  has_interest    BOOLEAN      NOT NULL DEFAULT FALSE,  -- demanda manifestada
  assigned_to     UUID,                              -- FK to identity.users (no FK constraint, cross-schema)
  assigned_at     TIMESTAMPTZ,
  last_visit_at   TIMESTAMPTZ,
  metadata        JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT current_timestamp,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT current_timestamp
);

COMMENT ON TABLE  census.homes              IS 'Hogares catastrados para asignacion de censos.';
COMMENT ON COLUMN census.homes.external_id  IS 'Identificador catastral unico (techito).';
COMMENT ON COLUMN census.homes.geom          IS 'Ubicacion geografica del hogar (lon/lat, SRID 4326).';
COMMENT ON COLUMN census.homes.has_interest  IS 'TRUE si hubo encuesta previa manifestando interes.';
COMMENT ON COLUMN census.homes.assigned_to   IS 'userId (UUID) del vendedor/tecnico asignado (cross-schema ref).';
