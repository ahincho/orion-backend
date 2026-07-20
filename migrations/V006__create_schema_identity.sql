-- =============================================================================
-- V006__create_schema_identity.sql
-- =============================================================================
-- Creates the 'identity' schema for the bounded context that owns
-- user accounts, sessions, login, register, and password changes.
-- All identity tables live under this schema. The 'public' schema
-- hosts the orion_migrations tracking table (managed by node-pg-migrate).
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS identity;

COMMENT ON SCHEMA identity IS 'ORION: Identity bounded context (users, sessions, auth).';
