-- 024_recon_fields_squareup.sql
--
-- 003_recon_intelligence.sql fails atomically on a fresh database: its very
-- first statement (`ALTER TABLE property_intelligence ADD COLUMN general_plan`)
-- duplicates a column schema.sql already defines. wrangler d1 execute runs a
-- migration file as one transaction, so that single duplicate rolled back
-- every other column in the file — not just the one that collided.
--
-- Confirmed by diffing pragma_table_info('property_intelligence') against
-- 003's column list: only `general_plan` was present; the other ~20 fields
-- the 12-agent recon system writes (year_built, fire_hazard_severity,
-- flood_zone_code, recon_status, etc.) were silently absent on a fresh build.
--
-- This file contains only the columns verified missing — no duplicates — so
-- it cannot roll back on the same failure. See docs/policy-packs.md's sibling
-- note in 001_recorder_records.sql for the same class of bug found earlier.

ALTER TABLE property_intelligence ADD COLUMN year_built TEXT;
ALTER TABLE property_intelligence ADD COLUMN coastal_zone_details TEXT;
ALTER TABLE property_intelligence ADD COLUMN flood_zone_code TEXT;
ALTER TABLE property_intelligence ADD COLUMN flood_firm_panel TEXT;
ALTER TABLE property_intelligence ADD COLUMN fire_hazard_severity TEXT;
ALTER TABLE property_intelligence ADD COLUMN tsunami_hazard TEXT;
ALTER TABLE property_intelligence ADD COLUMN earthquake_fault_zone TEXT;
ALTER TABLE property_intelligence ADD COLUMN liquefaction_zone TEXT;
ALTER TABLE property_intelligence ADD COLUMN landslide_risk TEXT;
ALTER TABLE property_intelligence ADD COLUMN sea_level_rise TEXT;
ALTER TABLE property_intelligence ADD COLUMN airport_compatibility TEXT;
ALTER TABLE property_intelligence ADD COLUMN jurisdiction TEXT;
ALTER TABLE property_intelligence ADD COLUMN supervisor_district TEXT;
ALTER TABLE property_intelligence ADD COLUMN school_district TEXT;
ALTER TABLE property_intelligence ADD COLUMN fire_district TEXT;
ALTER TABLE property_intelligence ADD COLUMN adu_eligibility TEXT;
ALTER TABLE property_intelligence ADD COLUMN williamson_act TEXT;
ALTER TABLE property_intelligence ADD COLUMN wetlands TEXT;
ALTER TABLE property_intelligence ADD COLUMN streamside_management TEXT;
ALTER TABLE property_intelligence ADD COLUMN recon_status TEXT;
ALTER TABLE property_intelligence ADD COLUMN recon_completed_at TEXT;
