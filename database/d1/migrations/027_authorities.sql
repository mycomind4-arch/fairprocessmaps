-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 027: Authority Reference Library
--
-- Phase 3.5: Authority Mapper agent support.
--
-- Reference table of government entities (boards, departments, official
-- roles) that have jurisdiction over property/code-enforcement matters in
-- Humboldt County. This is NOT a determination of who has authority over
-- any specific case — it's a lookup table the Authority Mapper agent
-- matches against, the same way `statutes` (migration 014) backs the
-- Statute Matcher.
--
-- The agent proposes relationships (case → jurisdiction_of → authority,
-- department → overseen_by → board, etc). Humans review. The agent never
-- asserts that an entity acted properly or improperly — it proposes a
-- jurisdictional connection for human confirmation.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS authorities (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,                  -- board | department | official
  name TEXT NOT NULL,
  role_title TEXT,                            -- for entity_type='official' — e.g. "Code Enforcement Officer"
  jurisdiction_level TEXT NOT NULL,            -- county | city | state | federal
  jurisdiction_scope TEXT NOT NULL,            -- 'unincorporated' | a city name | 'coastal_zone' | 'countywide'
  case_types TEXT NOT NULL DEFAULT '[]',       -- JSON array: which case_type values this entity has jurisdiction over
  parent_authority_id TEXT REFERENCES authorities(id), -- hierarchy: official -> department -> board
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_authorities_jurisdiction_scope ON authorities(jurisdiction_scope);
CREATE INDEX IF NOT EXISTS idx_authorities_entity_type ON authorities(entity_type);
CREATE INDEX IF NOT EXISTS idx_authorities_parent ON authorities(parent_authority_id);

-- ── Seed: Humboldt County jurisdiction chain ────────────────────────────────
-- Intentionally limited to entities the agent can match against with
-- reasonable confidence. Grows as the system expands to more jurisdictions.

INSERT INTO authorities (id, entity_type, name, role_title, jurisdiction_level, jurisdiction_scope, case_types, parent_authority_id, description) VALUES
  -- County-level board (top of the unincorporated-county hierarchy)
  ('auth.hc.board_of_supervisors', 'board', 'Humboldt County Board of Supervisors', NULL,
   'county', 'countywide', '["code_enforcement","permit","zoning"]', NULL,
   'Final administrative appeal body for unincorporated county land-use and code enforcement decisions.'),

  ('auth.hc.planning_commission', 'board', 'Humboldt County Planning Commission', NULL,
   'county', 'countywide', '["permit","zoning"]', 'auth.hc.board_of_supervisors',
   'Reviews discretionary permits and zoning matters; decisions appealable to the Board of Supervisors.'),

  -- County departments (unincorporated county)
  ('auth.hc.planning_building', 'department', 'Humboldt County Planning & Building Department', NULL,
   'county', 'unincorporated', '["code_enforcement","permit","zoning"]', 'auth.hc.planning_commission',
   'Administers building permits, zoning compliance, and code enforcement for unincorporated Humboldt County.'),

  ('auth.hc.code_enforcement_unit', 'department', 'Humboldt County Code Enforcement Unit', NULL,
   'county', 'unincorporated', '["code_enforcement"]', 'auth.hc.planning_building',
   'Investigates and processes code enforcement cases for unincorporated county parcels.'),

  -- County official roles
  ('auth.hc.zoning_administrator', 'official', 'Humboldt County Zoning Administrator', 'Zoning Administrator',
   'county', 'unincorporated', '["permit","zoning"]', 'auth.hc.planning_building',
   'Makes administrative zoning determinations and reviews minor use permits.'),

  ('auth.hc.building_inspector', 'official', 'Humboldt County Building Inspector', 'Building Inspector',
   'county', 'unincorporated', '["permit"]', 'auth.hc.planning_building',
   'Conducts inspections and finalizes building permits.'),

  ('auth.hc.code_enforcement_officer', 'official', 'Humboldt County Code Enforcement Officer', 'Code Enforcement Officer',
   'county', 'unincorporated', '["code_enforcement"]', 'auth.hc.code_enforcement_unit',
   'Serves notices, documents violations, and prepares code enforcement cases for hearing.'),

  -- Special/overlay jurisdiction
  ('auth.ca.coastal_commission', 'board', 'California Coastal Commission', NULL,
   'state', 'coastal_zone', '["permit","zoning"]', NULL,
   'Has concurrent or appellate jurisdiction over development within the California Coastal Zone.'),

  -- Incorporated cities within Humboldt County (each administers its own
  -- planning/building/code-enforcement function independent of the county)
  ('auth.eureka.planning', 'department', 'City of Eureka Development Services Department', NULL,
   'city', 'Eureka', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Eureka city limits.'),

  ('auth.arcata.planning', 'department', 'City of Arcata Community Development Department', NULL,
   'city', 'Arcata', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Arcata city limits.'),

  ('auth.fortuna.planning', 'department', 'City of Fortuna Community Development Department', NULL,
   'city', 'Fortuna', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Fortuna city limits.'),

  ('auth.riodell.planning', 'department', 'City of Rio Dell Planning Department', NULL,
   'city', 'Rio Dell', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Rio Dell city limits.'),

  ('auth.trinidad.planning', 'department', 'City of Trinidad Planning Department', NULL,
   'city', 'Trinidad', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Trinidad city limits.'),

  ('auth.ferndale.planning', 'department', 'City of Ferndale Planning Department', NULL,
   'city', 'Ferndale', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Ferndale city limits.'),

  ('auth.blueLake.planning', 'department', 'City of Blue Lake Planning Department', NULL,
   'city', 'Blue Lake', '["code_enforcement","permit","zoning"]', NULL,
   'Administers building permits, zoning, and code enforcement within Blue Lake city limits.');

-- ── Relationship type labels for the Authority Mapper's outputs ─────────────
-- 'member_of' and 'issued_by' already exist (migration 005). These two are
-- new — the agent_definitions row for authority_mapper (migration 012)
-- describes it as proposing exactly "jurisdiction_of and overseen_by"
-- relationships.

INSERT OR IGNORE INTO relationship_types (id, code, label, description, source_type, target_type) VALUES
  ('rt-jur-of', 'jurisdiction_of', 'Jurisdiction Of', 'Property falls under the administrative jurisdiction of this department', 'property', 'department'),
  ('rt-over-by', 'overseen_by', 'Overseen By', 'Department is overseen by this board or commission on appeal', 'department', 'authority');
