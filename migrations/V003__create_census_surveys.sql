-- =============================================================================
-- V003__create_census_surveys.sql
-- =============================================================================
-- Census surveys (encuestas de campo) collected by cuadrillas. Each survey
-- is linked to a home and captures interest level and basic demographics.
-- =============================================================================

CREATE TYPE census.survey_outcome AS ENUM (
  'interested',
  'not_interested',
  'not_home',
  'refused'
);

CREATE TABLE census.surveys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id       UUID NOT NULL REFERENCES census.homes(id) ON DELETE CASCADE,
  surveyor_id   UUID NOT NULL,                         -- userId (cross-schema)
  outcome       census.survey_outcome NOT NULL,
  interested_in_service BOOLEAN NOT NULL DEFAULT FALSE,
  notes         TEXT,
  visited_at    TIMESTAMPTZ NOT NULL DEFAULT current_timestamp,
  metadata      JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT current_timestamp
);

COMMENT ON TABLE  census.surveys            IS 'Encuestas de censo puerta a puerta.';
COMMENT ON COLUMN census.surveys.surveyor_id IS 'userId del vendedor/tecnico que realizo la encuesta.';
