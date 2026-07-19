-- =============================================================================
-- V005__create_census_indexes.sql
-- =============================================================================
-- Spatial and lookup indexes for the most common queries:
--   - find homes near a point (50m radius) -> idx_homes_geom
--   - list assignments for a user on a date -> idx_assignments_assignee_date
--   - list homes by department/municipality -> idx_homes_geo
--   - recent surveys for a home -> idx_surveys_home_visited
-- =============================================================================

-- Spatial index (GIST) for ST_DWithin queries
CREATE INDEX idx_homes_geom ON census.homes USING GIST (geom);

-- Lookup by external cadastral id (already unique, but explicit for clarity)
-- (already covered by UNIQUE constraint on external_id)

-- Assignment lookups
CREATE INDEX idx_assignments_assignee_date
  ON census.assignments (assignee_id, scheduled_date);

CREATE INDEX idx_assignments_home_date
  ON census.assignments (home_id, scheduled_date);

-- Home lookups by geographic division
CREATE INDEX idx_homes_geo
  ON census.homes (country_code, department, municipality);

-- Homes pending assignment (no assignee or last_visit stale)
CREATE INDEX idx_homes_unassigned_interest
  ON census.homes (has_interest, last_visit_at)
  WHERE assigned_to IS NULL;

-- Survey history for a home
CREATE INDEX idx_surveys_home_visited
  ON census.surveys (home_id, visited_at DESC);

-- Survey lookups by surveyor
CREATE INDEX idx_surveys_surveyor
  ON census.surveys (surveyor_id, visited_at DESC);
