-- FairProcess D1 Schema — Cloudflare Workers + D1
-- This file documents the production schema. Apply with: wrangler d1 execute fairprocess --file=database/d1/schema.sql

-- ── Properties ──
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  apn TEXT NOT NULL,
  address TEXT,
  city TEXT,
  zoning TEXT,
  acres REAL,
  legal_desc TEXT,
  centroid_lng REAL,
  centroid_lat REAL,
  geom_geojson TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_properties_apn ON properties(apn);
CREATE INDEX IF NOT EXISTS idx_properties_address ON properties(address);
CREATE INDEX IF NOT EXISTS idx_properties_city ON properties(city);

-- ── Projects ──
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  name TEXT NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'code_enforcement',
  department TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  due_process_score INTEGER,
  opened_at TEXT DEFAULT (datetime('now')),
  closed_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_property_id ON projects(property_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_case_type ON projects(case_type);

-- ── Evidence ──
CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  source TEXT NOT NULL DEFAULT 'manual',
  doc_type TEXT,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'raw',
  extracted_text TEXT,
  ai_summary TEXT,
  r2_key TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_project_id ON evidence(project_id);
CREATE INDEX IF NOT EXISTS idx_evidence_source ON evidence(source);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON evidence(status);
CREATE INDEX IF NOT EXISTS idx_evidence_created_at ON evidence(created_at);

-- ── Timeline Events ──
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  evidence_id TEXT REFERENCES evidence(id),
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_timeline_project_id ON timeline_events(project_id);
CREATE INDEX IF NOT EXISTS idx_timeline_event_date ON timeline_events(event_date);
CREATE INDEX IF NOT EXISTS idx_timeline_event_type ON timeline_events(event_type);

-- ── Due Process Findings ──
CREATE TABLE IF NOT EXISTS due_process_findings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  rule TEXT NOT NULL,
  rule_name TEXT,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL DEFAULT 'open',
  detail TEXT,
  evidence_id TEXT REFERENCES evidence(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_findings_project_id ON due_process_findings(project_id);
CREATE INDEX IF NOT EXISTS idx_findings_status ON due_process_findings(status);
CREATE INDEX IF NOT EXISTS idx_findings_severity ON due_process_findings(severity);

-- ── Building Permits ──
CREATE TABLE IF NOT EXISTS building_permits (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  permit_number TEXT,
  permit_type TEXT,
  permit_status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  valuation REAL,
  sqft REAL,
  issued_date TEXT,
  expired_date TEXT,
  finalized_date TEXT,
  assigned_inspector TEXT,
  inspections_count INTEGER DEFAULT 0,
  last_inspection_date TEXT,
  last_inspection_result TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_permits_project_id ON building_permits(project_id);
CREATE INDEX IF NOT EXISTS idx_permits_permit_status ON building_permits(permit_status);

-- ── Code Enforcement Cases ──
CREATE TABLE IF NOT EXISTS code_enforcement_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  case_number TEXT,
  violation_type TEXT,
  violation_description TEXT,
  severity TEXT NOT NULL DEFAULT 'moderate',
  status TEXT NOT NULL DEFAULT 'open',
  notice_served_date TEXT,
  notice_method TEXT,
  notice_period_days INTEGER,
  compliance_deadline TEXT,
  abatement_date TEXT,
  abatement_cost REAL,
  lien_filed INTEGER DEFAULT 0,
  hearing_date TEXT,
  hearing_type TEXT,
  appeal_filed INTEGER DEFAULT 0,
  appeal_date TEXT,
  outcome TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_enforcement_project_id ON code_enforcement_cases(project_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_status ON code_enforcement_cases(status);
CREATE INDEX IF NOT EXISTS idx_enforcement_case_number ON code_enforcement_cases(case_number);

-- ── Property Intelligence Cache ──
CREATE TABLE IF NOT EXISTS property_intelligence (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id),
  apn TEXT,
  zoning TEXT,
  general_plan TEXT,
  acres REAL,
  coastal_zone TEXT,
  flood_zone TEXT,
  fire_responsibility TEXT,
  legal_description TEXT,
  raw_data TEXT,
  fetched_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_intelligence_property_id ON property_intelligence(property_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_apn ON property_intelligence(apn);
