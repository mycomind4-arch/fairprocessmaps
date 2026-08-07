-- Migration 018: Add organization_id to relationships table for org isolation
-- P1-5: relationships table was missing org_id, allowing cross-org data leaks

-- Add organization_id column to relationships
ALTER TABLE relationships ADD COLUMN organization_id TEXT REFERENCES organizations(id);

-- Backfill: set organization_id from the case's project's organization_id
UPDATE relationships 
SET organization_id = (
  SELECT p.organization_id 
  FROM projects p 
  WHERE p.id = relationships.case_id
)
WHERE organization_id IS NULL;

-- Create index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_relationships_org_id ON relationships(organization_id);
