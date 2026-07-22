-- =============================================================================
-- V009__restrict_user_role_to_advisor_supervisor_agent.sql
-- =============================================================================
-- Stage 2 of the user-management feature plan. Restricts the role column
-- on identity.users to the new 3-tier English enum (`advisor`, `supervisor`,
-- `agent`) and backfills existing rows so the migration is safe to run
-- in environments that already have data.
--
-- Backfill mapping (from the old 4-role Spanish/mixed enum):
--   asesor       -> advisor   (front-line advisor, top of the new hierarchy)
--   admin        -> advisor   (admin loses implicit powers; advisor is the
--                              only role with full CRUD on users)
--   distribuidor -> agent  (bottom-tier field role)
--   supervisor   -> supervisor (unchanged)
--
-- Implementation notes:
--   - The original CHECK constraint was defined inline in V007 and is
--     auto-named by Postgres; the DO block below resolves it dynamically
--     to avoid relying on the generated name (`users_role_check`).
--   - Migration runs in a single transaction (singleTransaction=true in
--     .npmrc.migrate), so backfill + constraint swap are atomic.
-- =============================================================================

BEGIN;

-- Step 1: backfill existing rows to the new enum.
UPDATE identity.users SET role = 'advisor'  WHERE role IN ('asesor', 'admin');
UPDATE identity.users SET role = 'agent' WHERE role = 'distribuidor';
-- 'supervisor' is unchanged.

-- Step 2: drop the old CHECK constraint by introspecting pg_constraint so
-- the migration is robust against the auto-generated constraint name.
DO $$
DECLARE
  constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'identity.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%role%'
      AND pg_get_constraintdef(oid) ILIKE '%asesor%'
  LOOP
    EXECUTE format('ALTER TABLE identity.users DROP CONSTRAINT %I', constraint_record.conname);
  END LOOP;
END $$;

-- Step 3: add the new CHECK constraint enforcing the 3-role English enum.
ALTER TABLE identity.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('advisor', 'supervisor', 'agent'));

-- Step 4: refresh table/column comments to reflect the new role names.
COMMENT ON TABLE identity.users
  IS 'ORION identity context: user accounts (advisors, supervisors, agents).';
COMMENT ON COLUMN identity.users.role
  IS 'Rol RBAC: advisor | supervisor | agent.';

COMMIT;