-- =============================================================================
-- V007__create_users.sql
-- =============================================================================
-- Users (asesores, supervisores, distribuidores, admins). Mirrors the
-- `UsersTable` interface in
--   contexts/identity/src/infra/database.ts
-- and the `User` domain model in
--   contexts/identity/src/domain/user.ts
--
-- Notes:
--   - id is a UUID generated server-side via gen_random_uuid() (provided
--     by pgcrypto, which RDS Postgres enables by default).
--   - email is unique and stored case-folded to match the queries in
--     user-repository.ts (`where('email', '=', email.toLowerCase())`).
--   - role is constrained to the four Sprint 1 values; new roles will
--     require a new migration.
--   - `assigned_to` / `assignee_id` columns in the census schema
--     reference this table by UUID but do not declare a foreign key
--     (cross-schema refs are intentionally not enforced at the DB
--     level to keep the bounded contexts decoupled).
-- =============================================================================

CREATE TABLE identity.users (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  full_name     VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(32)  NOT NULL
                  CHECK (role IN ('asesor', 'supervisor', 'distribuidor', 'admin')),
  active        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT current_timestamp,
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT current_timestamp
);

COMMENT ON TABLE  identity.users              IS 'ORION identity context: user accounts (asesores, supervisores, distribuidores, admins).';
COMMENT ON COLUMN identity.users.id            IS 'Identificador universal (UUID v4).';
COMMENT ON COLUMN identity.users.email         IS 'Email unico, case-insensitive (lowercased before insert/lookup).';
COMMENT ON COLUMN identity.users.full_name     IS 'Nombre completo del usuario.';
COMMENT ON COLUMN identity.users.password_hash IS 'Hash del password (bcrypt via contexts/identity/src/password-hasher.ts).';
COMMENT ON COLUMN identity.users.role          IS 'Rol RBAC: asesor | supervisor | distribuidor | admin.';
COMMENT ON COLUMN identity.users.active        IS 'FALSE deshabilita el login sin borrar la fila (preserva FKs historicas).';
COMMENT ON COLUMN identity.users.created_at    IS 'Timestamp de creacion.';
COMMENT ON COLUMN identity.users.updated_at    IS 'Timestamp de ultima actualizacion (e.g. password change).';
