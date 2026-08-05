-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 014: Statute Library
--
-- Reference table of statutes and ordinances that the Statute Matcher
-- agent matches against. This is NOT legal advice — it's a lookup table
-- of known legal references relevant to code enforcement proceedings.
--
-- The agent proposes relationships (finding → mandated_by → statute).
-- Humans review and accept/reject. The agent never asserts that a
-- statute applies — it proposes a connection for human review.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS statutes (
  id TEXT PRIMARY KEY,
  citation TEXT NOT NULL,                    -- e.g. "HCC § 12.04.030"
  title TEXT NOT NULL,                        -- short title
  jurisdiction TEXT NOT NULL,                 -- "Humboldt County", "California", "Eureka"
  jurisdiction_level TEXT NOT NULL,           -- county | state | city
  category TEXT NOT NULL,                     -- notice | hearing | enforcement | permit | nuisance | substandard
  summary TEXT,                               -- plain-language summary
  keywords TEXT,                              -- JSON array of matching keywords
  notice_period_days INTEGER,                 -- if this statute defines a notice period
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_statutes_jurisdiction ON statutes(jurisdiction);
CREATE INDEX IF NOT EXISTS idx_statutes_category ON statutes(category);
CREATE INDEX IF NOT EXISTS idx_statutes_citation ON statutes(citation);

-- ── Seed: Known Humboldt County / California code enforcement statutes ──────
-- These are the statutes the Statute Matcher can propose relationships to.
-- The list is intentionally limited — it will grow as the system expands.

INSERT INTO statutes (id, citation, title, jurisdiction, jurisdiction_level, category, summary, keywords, notice_period_days) VALUES
  -- Notice requirements
  ('statute.hcc.1204', 'HCC § 12.04.030', 'Notice of Violation Service Requirements',
   'Humboldt County', 'county', 'notice',
   'Requires service of notice of violation before enforcement action. Minimum 10-day notice period for most violations.',
   '["notice","service","violation","10 days","ten days","notice period"]',
   10),

  ('statute.hcc.1204.040', 'HCC § 12.04.040', 'Notice Period for Hearing',
   'Humboldt County', 'county', 'hearing',
   'Establishes the minimum notice period before a hearing may be conducted. Notice must be served and sufficient time given for response.',
   '["hearing","notice","hearing date","notice period","service"]',
   10),

  -- Hearing requirements
  ('statute.gc.11509', 'GC § 11509', 'Administrative Procedure Act — Hearing Notice',
   'California', 'state', 'hearing',
   'California Administrative Procedure Act requires reasonable notice before any administrative hearing. Minimum 10 days notice unless otherwise specified.',
   '["hearing","notice","administrative","10 days","reasonable notice","due process"]',
   10),

  ('statute.hcc.1204.050', 'HCC § 12.04.050', 'Hearing Procedures',
   'Humboldt County', 'county', 'hearing',
   'Governs the conduct of code enforcement hearings including notice requirements, evidence presentation, and decision timelines.',
   '["hearing","procedure","evidence","decision","conduct"]',
   NULL),

  -- Enforcement
  ('statute.hcc.1204.060', 'HCC § 12.04.060', 'Enforcement Authority',
   'Humboldt County', 'county', 'enforcement',
   'Authorizes the county to enforce code violations through administrative penalties, compliance orders, and abatement.',
   '["enforcement","penalty","abatement","compliance","authority","administrative"]',
   NULL),

  ('statute.hcc.1204.070', 'HCC § 12.04.070', 'Compliance Deadlines',
   'Humboldt County', 'county', 'enforcement',
   'Sets timelines for compliance with code enforcement orders. Default compliance period is 30 days unless otherwise specified.',
   '["compliance","deadline","30 days","thirty days","compliance period","order"]',
   NULL),

  -- Nuisance
  ('statute.hcc.312', 'HCC § 312.0', 'Public Nuisance Abatement',
   'Humboldt County', 'county', 'nuisance',
   'Defines public nuisances and authorizes abatement procedures. Requires notice to property owner before abatement.',
   '["nuisance","abatement","public nuisance","property","owner"]',
   NULL),

  ('statute.cc.3479', 'CC § 3479', 'Public Nuisance Definition',
   'California', 'state', 'nuisance',
   'California Civil Code definition of public nuisance. Anything injurious to health, indecent, or offensive to the senses.',
   '["nuisance","public nuisance","civil code","definition","injurious","offensive"]',
   NULL),

  -- Substandard housing
  ('statute.hsc.17920', 'HSC § 17920', 'Substandard Housing Definition',
   'California', 'state', 'substandard',
   'California Health and Safety Code definition of substandard housing conditions.',
   '["substandard","housing","health and safety","unsafe","habitable","conditions"]',
   NULL),

  ('statute.hsc.17980', 'HSC § 17980', 'Substandard Housing Enforcement',
   'California', 'state', 'substandard',
   'Authorizes enforcement actions for substandard housing including repair orders and relocation assistance.',
   '["substandard","enforcement","repair","relocation","order","housing"]',
   NULL),

  -- Permits
  ('statute.hcc.1300', 'HCC § 1300.0', 'Building Permit Requirements',
   'Humboldt County', 'county', 'permit',
   'Requires building permits for construction, alteration, or repair of structures. Work without a permit is a violation.',
   '["permit","building","construction","alteration","repair","without permit"]',
   NULL),

  ('statute.hcc.1300.010', 'HCC § 1300.010', 'Permit Application and Review',
   'Humboldt County', 'county', 'permit',
   'Governs the permit application and review process including timelines and requirements for plan submission.',
   '["permit","application","review","plan","submission","timeline"]',
   NULL),

  -- Due process
  ('statute.gc.11510', 'GC § 11510', 'Administrative Due Process — Right to Hearing',
   'California', 'state', 'hearing',
   'Guarantees the right to a fair hearing in administrative proceedings. Includes right to present evidence and cross-examine.',
   '["due process","hearing","right","fair","evidence","cross-examine","administrative"]',
   NULL);
