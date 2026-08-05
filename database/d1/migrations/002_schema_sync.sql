-- Migration 002: Sync schema with API routes
-- Run after initial schema to add missing columns to code_enforcement_cases and building_permits
-- This migration is idempotent — safe to run multiple times (SQLite ALTER TABLE ADD COLUMN is idempotent if column doesn't exist)

-- ── building_permits: add missing columns ──
-- The original schema used 'status' and 'expiry_date'; the API uses 'permit_status' and 'expired_date'.
-- We add the new columns and migrate data from old columns.

ALTER TABLE building_permits ADD COLUMN permit_status TEXT;
UPDATE building_permits SET permit_status = status WHERE permit_status IS NULL;

ALTER TABLE building_permits ADD COLUMN sqft REAL;
ALTER TABLE building_permits ADD COLUMN expired_date TEXT;
UPDATE building_permits SET expired_date = expiry_date WHERE expired_date IS NULL AND expiry_date IS NOT NULL;

ALTER TABLE building_permits ADD COLUMN finalized_date TEXT;
ALTER TABLE building_permits ADD COLUMN assigned_inspector TEXT;
ALTER TABLE building_permits ADD COLUMN inspections_count INTEGER DEFAULT 0;
ALTER TABLE building_permits ADD COLUMN last_inspection_date TEXT;
ALTER TABLE building_permits ADD COLUMN last_inspection_result TEXT;
ALTER TABLE building_permits ADD COLUMN notes TEXT;
ALTER TABLE building_permits ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- ── code_enforcement_cases: add missing columns ──
ALTER TABLE code_enforcement_cases ADD COLUMN violation_description TEXT;
ALTER TABLE code_enforcement_cases ADD COLUMN severity TEXT DEFAULT 'moderate';

-- Migrate notice_date to notice_served_date
ALTER TABLE code_enforcement_cases ADD COLUMN notice_served_date TEXT;
UPDATE code_enforcement_cases SET notice_served_date = notice_date WHERE notice_served_date IS NULL AND notice_date IS NOT NULL;

ALTER TABLE code_enforcement_cases ADD COLUMN notice_method TEXT;
ALTER TABLE code_enforcement_cases ADD COLUMN notice_period_days INTEGER;
ALTER TABLE code_enforcement_cases ADD COLUMN lien_filed INTEGER DEFAULT 0;
ALTER TABLE code_enforcement_cases ADD COLUMN hearing_type TEXT;
ALTER TABLE code_enforcement_cases ADD COLUMN appeal_filed INTEGER DEFAULT 0;
ALTER TABLE code_enforcement_cases ADD COLUMN appeal_date TEXT;
ALTER TABLE code_enforcement_cases ADD COLUMN notes TEXT;
ALTER TABLE code_enforcement_cases ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

-- ── projects: add updated_at ──
ALTER TABLE projects ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));
