-- Migration 003: Enhanced Property Intelligence Cache
-- Adds columns to property_intelligence for comprehensive recon data storage.
-- The raw_data JSON column stores all 12 agent results; the typed columns
-- allow fast queries on key fields.

-- The property_intelligence table already exists with basic columns.
-- Add new columns for the enhanced recon system (IF NOT EXISTS syntax for
-- SQLite compatibility with existing databases).

ALTER TABLE property_intelligence ADD COLUMN general_plan TEXT;
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
