-- =============================================================================
-- V001__create_schema_census.sql
-- =============================================================================
-- Creates the 'census' schema for the P1 bounded context (Asignacion de
-- Censos). All census tables live under this schema. The 'public' schema
-- hosts the orion_migrations tracking table (managed by node-pg-migrate).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS census;

COMMENT ON SCHEMA census IS 'ORION P1: Asignacion de Censos bounded context.';
