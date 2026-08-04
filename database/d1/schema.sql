-- FairProcess D1 schema
-- Property = the parcel itself (one row ever, per APN)
-- Project  = a specific enforcement/permitting matter on that property
--            (a parcel can have zero, one, or many projects over time)

CREATE TABLE properties (
  id            TEXT PRIMARY KEY,          -- uuid
  apn           TEXT NOT NULL UNIQUE,      -- county assessor parcel number
  address       TEXT,
  city          TEXT,
  county        TEXT NOT NULL DEFAULT 'Humboldt',
  zoning        TEXT,
  acres         REAL,
  legal_desc    TEXT,
  centroid_lng  REAL,
  centroid_lat  REAL,
  geom_geojson  TEXT,                      -- parcel boundary, stored as GeoJSON text
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_properties_apn ON properties(apn);

CREATE TABLE projects (
  id              TEXT PRIMARY KEY,        -- uuid
  property_id     TEXT NOT NULL REFERENCES properties(id),
  name            TEXT NOT NULL,           -- e.g. "2024 Cannabis Abatement"
  case_type       TEXT NOT NULL,           -- 'code_enforcement' | 'building' | 'adu_permit' | 'other'
  department      TEXT,                    -- 'Code Enforcement' | 'Building Dept' | ...
  status          TEXT NOT NULL DEFAULT 'open', -- 'open' | 'closed' | 'archived'
  due_process_score INTEGER,               -- cached from latest analysis run
  opened_at       TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at       TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_projects_property ON projects(property_id);
CREATE INDEX idx_projects_status ON projects(status);

-- Evidence is anchored to a project (not directly to the property),
-- so a parcel's history stays split by case.
CREATE TABLE evidence (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  source        TEXT NOT NULL,             -- 'upload' | 'building_dept' | 'code_enforcement' | 'ai_research'
  doc_type      TEXT,                      -- 'notice' | 'hearing_record' | 'correspondence' | 'permit' | ...
  title         TEXT,
  r2_key        TEXT,                      -- object storage path (R2)
  extracted_text TEXT,
  ai_summary    TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'processed' | 'flagged'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_evidence_project ON evidence(project_id);

-- Loose relationship graph between evidence, modeled relationally.
-- Covers "related evidence" lookups (1-2 hop) without a graph database.
CREATE TABLE evidence_relations (
  evidence_id         TEXT NOT NULL REFERENCES evidence(id),
  related_evidence_id TEXT NOT NULL REFERENCES evidence(id),
  relationship_type   TEXT NOT NULL,       -- 'supersedes' | 'references' | 'responds_to' | 'contradicts'
  PRIMARY KEY (evidence_id, related_evidence_id, relationship_type)
);

CREATE TABLE timeline_events (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  evidence_id   TEXT REFERENCES evidence(id), -- source doc this event was extracted from, if any
  event_date    TEXT NOT NULL,
  event_type    TEXT NOT NULL,             -- 'notice_sent' | 'hearing_held' | 'appeal_filed' | ...
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_timeline_project ON timeline_events(project_id);

CREATE TABLE due_process_findings (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id),
  rule          TEXT NOT NULL,             -- 'adequate_notice_period' | 'right_to_hearing' | ...
  rule_name      TEXT,                      -- human-readable rule name
  severity      TEXT NOT NULL,             -- 'critical' | 'warning' | 'info'
  status        TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  detail        TEXT,
  evidence_id   TEXT REFERENCES evidence(id), -- supporting evidence, if any
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_findings_project ON due_process_findings(project_id);
