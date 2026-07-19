-- =============================================================================
-- V004__create_census_assignments.sql
-- =============================================================================
-- Daily assignments of homes to cuadrilla members. Each row represents
-- one home assigned to one user for one date. Uniqueness ensures no
-- double-booking.
-- =============================================================================

CREATE TYPE census.assignment_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TABLE census.assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id         UUID NOT NULL REFERENCES census.homes(id) ON DELETE CASCADE,
  assignee_id     UUID NOT NULL,                       -- userId (cross-schema)
  assigned_by     UUID NOT NULL,                       -- userId of supervisor
  scheduled_date  DATE NOT NULL,
  status          census.assignment_status NOT NULL DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  UNIQUE (home_id, scheduled_date)
);

COMMENT ON TABLE  census.assignments           IS 'Asignaciones diarias de hogares a vendedores/tecnicos.';
COMMENT ON COLUMN census.assignments.assignee_id IS 'userId del vendedor/tecnico asignado.';
COMMENT ON COLUMN census.assignments.assigned_by IS 'userId del supervisor que realizo la asignacion.';
