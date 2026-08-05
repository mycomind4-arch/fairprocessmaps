-- Demo Case: "Humboldt County Cannabis Abatement" 
-- A realistic due-process violation scenario for demos and investor walkthroughs.
-- Apply with: npx wrangler d1 execute fairprocess --remote --file=database/d1/seed_demo_case.sql
--
-- Scenario: Property owner received a code enforcement notice for unpermitted cannabis
-- cultivation structures. The county abated (demolished) the structures only 3 days after
-- the notice was served — well before the 10-day minimum compliance window. No hearing was
-- conducted. The owner was not informed of appeal rights. The analyzer catches all three.

INSERT INTO properties (id, apn, address, city, zoning, acres, legal_desc, centroid_lat, centroid_lng)
VALUES (
  'demo-prop-001',
  '205-131-012',
  '1234 Kneeland Rd',
  'Kneeland, CA',
  'Agriculture Exclusive (AE)',
  38.5,
  'The North 1/2 of Section 14, Township 4N, Range 2E, HBM',
  40.7284,
  -123.9408
);

INSERT INTO property_intelligence (id, property_id, apn, zoning, general_plan, acres, coastal_zone, flood_zone, fire_responsibility, legal_description)
VALUES (
  'demo-intel-001',
  'demo-prop-001',
  '205-131-012',
  'Agriculture Exclusive (AE)',
  'Agriculture Production',
  38.5,
  'No',
  'Zone X (Minimal Flood Hazard)',
  'State Responsibility Area (SRA)',
  'The North 1/2 of Section 14, Township 4N, Range 2E, HBM'
);

INSERT INTO projects (id, property_id, name, case_type, status, due_process_score, opened_at)
VALUES (
  'demo-proj-001',
  'demo-prop-001',
  '2026 Kneeland Cannabis Abatement',
  'code_enforcement',
  'open',
  50,
  '2026-07-15T08:00:00Z'
);

-- Code enforcement case record
INSERT INTO code_enforcement_cases (
  id, project_id, case_number, violation_type, violation_description, severity,
  status, notice_served_date, notice_method, notice_period_days, compliance_deadline,
  abatement_date, abatement_cost, lien_filed, hearing_date, hearing_type,
  appeal_filed, appeal_date, outcome
) VALUES (
  'demo-ce-001',
  'demo-proj-001',
  'CE-2026-0187',
  'Unpermitted Structure / Cannabis Cultivation',
  'Three unpermitted greenhouse structures and electrical improvements without building permits or county cannabis license.',
  'major',
  'open',
  '2026-07-10',
  'Posted on property + certified mail',
  10,
  '2026-07-20',
  '2026-07-13',
  8400.00,
  0,
  NULL,
  NULL,
  0,
  NULL,
  NULL
);

-- Evidence records
INSERT INTO evidence (id, project_id, source, doc_type, title, status, extracted_text)
VALUES
  ('demo-ev-001', 'demo-proj-001', 'manual', 'notice', 'Notice of Violation — CE-2026-0187', 'processed',
   'NOTICE OF VIOLATION — Humboldt County Code Enforcement. Case #CE-2026-0187. You are hereby notified that the property at 1234 Kneeland Rd (APN 205-131-012) is in violation of Humboldt County Code §313-6 (unpermitted structures) and §554.4 (cannabis cultivation without permit). You have 10 days from the date of this notice to come into compliance. Dated: July 10, 2026.'),
  ('demo-ev-002', 'demo-proj-001', 'manual', 'abatement_order', 'County Abatement Report — CE-2026-0187', 'processed',
   'ABATEMENT REPORT — Humboldt County Building Inspection Division. Case #CE-2026-0187. On July 13, 2026, county contractors demolished three unpermitted greenhouse structures. Total cost: $8,400. No prior hearing was conducted. Notice was served July 10, 2026. Abatement occurred 3 days after notice.'),
  ('demo-ev-003', 'demo-proj-001', 'manual', 'email', 'Email correspondence with property owner', 'processed',
   'Owner email dated July 15, 2026: "I never received any notice before they tore down my greenhouses. I only found out when my neighbor called me. Nobody told me I could appeal or request a hearing. The structures were built in 2019 and I was in the process of getting permits."');

-- Timeline events
INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description) VALUES
  ('demo-tl-001', 'demo-proj-001', 'demo-ev-001', '2026-07-10', 'notice', 'Notice of Violation posted on property and sent via certified mail (CE-2026-0187)'),
  ('demo-tl-002', 'demo-proj-001', 'demo-ev-002', '2026-07-13', 'abatement', 'County abated three unpermitted greenhouse structures — 3 days after notice served'),
  ('demo-tl-003', 'demo-proj-001', 'demo-ev-002', '2026-07-13', 'fine', 'Abatement cost assessed: $8,400. Lien not yet filed.'),
  ('demo-tl-004', 'demo-proj-001', 'demo-ev-003', '2026-07-15', 'deadline', 'Owner reports no prior knowledge of notice or hearing opportunity'),
  ('demo-tl-005', 'demo-proj-001', NULL, '2026-07-20', 'deadline', 'Original compliance deadline (10 days after notice) — passed after abatement already occurred');

-- Due-process findings (what the analyzer would detect)
INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, evidence_id) VALUES
  ('demo-finding-001', 'demo-proj-001', 'abatement_without_notice', 'Abatement Without Proper Notice Period', 'critical', 'open',
   'Property was abated on 2026-07-13, only 3 days after notice was served on 2026-07-10. The compliance period was 10 days (until 2026-07-20). Abatement occurred before the compliance deadline expired, violating the owner''s right to cure the violation within the notice period.',
   'demo-ev-002'),
  ('demo-finding-002', 'demo-proj-001', 'hearing_right', 'Adverse Action Without Hearing', 'critical', 'open',
   'The county conducted abatement (demolition of structures) without any recorded hearing. No hearing date, hearing type, or hearing record exists. Adverse action of this magnitude requires a pre-deprivation hearing or, at minimum, a post-deprivation hearing opportunity.',
   'demo-ev-002'),
  ('demo-finding-003', 'demo-proj-001', 'appeal_pathway', 'Missing Appeal Rights Notice', 'warning', 'open',
   'The Notice of Violation and Abatement Report do not mention appeal or review rights. The property owner was not informed of their right to appeal the abatement or seek review of the enforcement action.',
   'demo-ev-001'),
  ('demo-finding-004', 'demo-proj-001', 'notice_timing', 'Abatement Before Compliance Window', 'warning', 'open',
   'An abatement action (fine/penalty/lien) was taken 3 days after notice, which is less than the 10-day minimum compliance period. The notice period of 10 days was specified but not honored.',
   'demo-ev-002');

-- Building permit record (for context)
INSERT INTO building_permits (id, project_id, permit_number, permit_type, permit_status, description, issued_date, notes)
VALUES (
  'demo-permit-001',
  'demo-proj-001',
  'BLDG-2019-3341',
  'Agricultural Building',
  'expired',
  'Permit application for greenhouse construction — submitted 2019, never approved due to incomplete cannabis license documentation.',
  NULL,
  'Permit application was submitted but expired before approval. Owner claims they were in the process of resubmitting when abatement occurred.'
);
