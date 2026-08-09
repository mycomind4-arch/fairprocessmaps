-- Migration 015: Case / legacy Project bridge backfill
--
-- The Case model was introduced in migration 004 without automatically
-- creating Case records for existing projects. This migration closes that
-- gap without changing or deleting legacy project data.
--
-- After this migration every existing project has a primary Case link unless
-- it was already linked to a Case. New application workflows must use Case
-- IDs; project IDs remain compatibility identifiers for the existing panels
-- and recon pipeline during the transition.

INSERT OR IGNORE INTO cases (
  id,
  organization_id,
  name,
  case_number,
  case_type,
  status,
  description,
  opened_at,
  closed_at,
  updated_at
)
SELECT
  'case-' || p.id,
  p.organization_id,
  p.name,
  NULL,
  p.case_type,
  p.status,
  NULL,
  p.opened_at,
  p.closed_at,
  p.updated_at
FROM projects p
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM case_projects cp
    WHERE cp.project_id = p.id
  );

INSERT OR IGNORE INTO case_projects (
  id,
  case_id,
  project_id,
  role
)
SELECT
  'case-project-' || p.id,
  'case-' || p.id,
  p.id,
  'primary'
FROM projects p
WHERE p.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM case_projects cp
    WHERE cp.project_id = p.id
  );

CREATE INDEX IF NOT EXISTS idx_caseproj_primary_project
  ON case_projects(project_id, role);
