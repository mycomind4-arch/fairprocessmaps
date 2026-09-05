-- 022_policy_provenance.sql
--
-- Findings become citation-anchored.
--
-- Before this migration a finding said "Only 4 days between notice and action
-- (minimum: 10)" with no record of where the 10 came from. A reader could not
-- verify it and a report could not be reproduced. Every finding now carries the
-- authority it rests on, the policy pack and version that produced it, and a
-- neutral status describing what the record shows rather than concluding what
-- the law requires.
--
-- See frontend/web/src/lib/policy/types.ts for the status vocabulary.

-- Neutral evaluation outcome: Observed | NotLocated | InsufficientEvidence
-- | AwaitingTrigger | Satisfied. Distinct from `status`, which tracks the
-- human review lifecycle (open / resolved / dismissed / superseded).
ALTER TABLE due_process_findings ADD COLUMN rule_status TEXT;

-- Provenance. A finding without a citation must not be rendered or exported.
ALTER TABLE due_process_findings ADD COLUMN citation TEXT;
ALTER TABLE due_process_findings ADD COLUMN source_url TEXT;
ALTER TABLE due_process_findings ADD COLUMN authority TEXT;

-- Reproducibility: which pack, at which version, produced this finding.
ALTER TABLE due_process_findings ADD COLUMN policy_pack TEXT;
ALTER TABLE due_process_findings ADD COLUMN policy_version TEXT;

-- 1 when the governing pack has not cleared legal review. Provisional findings
-- render with a warning and are excluded from court-facing exports.
ALTER TABLE due_process_findings ADD COLUMN provisional INTEGER DEFAULT 1;

-- What a human can do to resolve an unevaluable checkpoint.
ALTER TABLE due_process_findings ADD COLUMN recommended_action TEXT;

CREATE INDEX IF NOT EXISTS idx_findings_rule_status ON due_process_findings(rule_status);
CREATE INDEX IF NOT EXISTS idx_findings_policy_pack ON due_process_findings(policy_pack);

-- Jurisdiction drives pack selection. Every property ingested so far came from
-- the Humboldt County ArcGIS endpoint, so backfilling that value is accurate
-- rather than an assumption.
ALTER TABLE properties ADD COLUMN county TEXT;
UPDATE properties SET county = 'Humboldt County' WHERE county IS NULL;

CREATE INDEX IF NOT EXISTS idx_properties_county ON properties(county);

-- Findings written before this migration predate the policy engine. Mark them
-- superseded rather than backfilling a citation we cannot substantiate; the
-- next analysis run regenerates them with full provenance.
UPDATE due_process_findings
   SET status = 'superseded'
 WHERE citation IS NULL
   AND status = 'open';
