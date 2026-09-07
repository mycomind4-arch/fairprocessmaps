/**
 * Authority Mapper Agent — Evaluation Test Suite
 *
 * Validates required outputs (expected) and forbidden outputs (must not appear).
 * An agent that fails any test case cannot deploy to production.
 *
 * Run via: npx tsx frontend/web/src/lib/agents/tests/authority-mapper.test.ts
 */

import { AUTHORITY_MAPPER_AGENT } from "../authority-mapper";
import { validateAgentOutput } from "../validator";
import type { AgentInputSnapshot, AgentProposalDraft, AuthorityRef } from "../types";

// ── Test framework ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function assertNoForbidden(proposals: AgentProposalDraft[], agentType: string) {
  const validation = validateAgentOutput(proposals, agentType);
  assert(validation.rejected_proposals.length === 0,
    `Forbidden output detected: ${validation.rejected_proposals.map(r => r.reason).join("; ")}`);
}

// ── Shared fixture: a small authority reference set ─────────────────────────

const PLANNING_BUILDING: AuthorityRef = {
  id: "auth.hc.planning_building", entity_type: "department",
  name: "Humboldt County Planning & Building Department", role_title: null,
  jurisdiction_level: "county", jurisdiction_scope: "unincorporated",
  case_types: ["code_enforcement", "permit", "zoning"],
  parent_authority_id: "auth.hc.planning_commission",
  description: "Administers building permits and code enforcement for unincorporated county.",
};

const PLANNING_COMMISSION: AuthorityRef = {
  id: "auth.hc.planning_commission", entity_type: "board",
  name: "Humboldt County Planning Commission", role_title: null,
  jurisdiction_level: "county", jurisdiction_scope: "countywide",
  case_types: ["permit", "zoning"], parent_authority_id: null,
  description: "Reviews discretionary permits.",
};

const EUREKA_PLANNING: AuthorityRef = {
  id: "auth.eureka.planning", entity_type: "department",
  name: "City of Eureka Development Services Department", role_title: null,
  jurisdiction_level: "city", jurisdiction_scope: "Eureka",
  case_types: ["code_enforcement", "permit", "zoning"], parent_authority_id: null,
  description: "Administers permits and code enforcement within Eureka.",
};

const AUTHORITIES: AuthorityRef[] = [PLANNING_BUILDING, PLANNING_COMMISSION, EUREKA_PLANNING];

type SnapshotOverrides = Partial<Omit<AgentInputSnapshot, "property">> & {
  property?: Partial<Omit<AgentInputSnapshot["property"], "id">>;
};

function baseSnapshot(overrides: SnapshotOverrides): AgentInputSnapshot {
  const { property: propertyOverride, ...rest } = overrides;
  return {
    case_id: "case_1", organization_id: "org_test", case_name: "Test Case",
    case_type: "code_enforcement", jurisdiction: "Humboldt County",
    timeline: [], evidence: [], findings: [], ce_cases: [], permits: [],
    relationships: [], statutes: [], authorities: AUTHORITIES,
    ...rest,
    property: { id: "property_1", apn: "", address: "", city: "", zoning: "", ...propertyOverride },
  };
}

// ── Test Case 1: Unincorporated county — inferred jurisdiction ──────────────

async function testUnincorporatedJurisdiction() {
  console.log("\nTest 1: Unincorporated county property (no city on record)");

  const input = baseSnapshot({ property: { apn: "001-001-001", address: "123 Rural Rd", city: "", zoning: "AE" } });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const jurisdiction = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "jurisdiction_of" &&
    p.target_id === "auth.hc.planning_building",
  );
  assert(jurisdiction.length === 1, "Should propose property -> jurisdiction_of -> Planning & Building");
  assert(jurisdiction[0]?.source_type === "property", "Jurisdiction proposal source must be 'property' per the phase-3 evaluation contract");
  assert(jurisdiction[0]?.source_id === input.property.id, "Jurisdiction proposal source_id must be the property's id, not the case's");
  assert(jurisdiction[0]?.confidence === 0.65, "Inferred (no-city) jurisdiction should have confidence 0.65");
  assert(jurisdiction[0]?.confidence! <= 0.9, "Confidence must never exceed agent ceiling");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals`);
}

// ── Test Case 2: Incorporated city — explicit jurisdiction ──────────────────
//
// Mirrors docs/phase-3-evaluation-contract.md §4 Test Case 1 ("Clear
// Jurisdiction"): confidence must exceed 0.8 for an explicit city match.

async function testCityJurisdiction() {
  console.log("\nTest 2: Property within an incorporated city (contract: confidence > 0.8)");

  const input = baseSnapshot({ property: { apn: "002-002-002", address: "1 Main St", city: "Eureka", zoning: "C-1" } });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const jurisdiction = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "jurisdiction_of" &&
    p.target_id === "auth.eureka.planning",
  );
  assert(jurisdiction.length === 1, "Should propose property -> jurisdiction_of -> City of Eureka");
  assert(jurisdiction[0]?.source_type === "property", "Jurisdiction proposal source must be 'property'");
  assert(jurisdiction[0]?.confidence! > 0.8, "Explicit city match must exceed 0.8 confidence per the evaluation contract");
  assert(jurisdiction[0]?.confidence! <= 0.95, "Confidence must never exceed the platform-wide ceiling of 0.95");

  // Eureka has no parent_authority_id in this fixture — no oversight chain expected
  const oversight = result.proposals.filter(p => p.relationship_type === "overseen_by");
  assert(oversight.length === 0, "Should NOT propose an oversight chain when the matched department has no registered parent");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals`);
}

// ── Test Case 3: Unknown city — missing_info, not a guess ───────────────────

async function testUnknownCity() {
  console.log("\nTest 3: City not in the authority reference table");

  const input = baseSnapshot({ property: { apn: "003-003-003", address: "1 Elm St", city: "Weott", zoning: "R-1" } });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const missing = result.proposals.filter(p => p.proposal_type === "missing_info" && p.info_type === "authority");
  assert(missing.length === 1, "Should produce missing_info when the city has no registered department");

  const jurisdiction = result.proposals.filter(p => p.relationship_type === "jurisdiction_of");
  assert(jurisdiction.length === 0, "Should NOT guess a jurisdiction it has no reference match for");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals, no unfounded guess`);
}

// ── Test Case 4: Oversight chain — department has a registered parent ───────

async function testOversightChain() {
  console.log("\nTest 4: Matched department has a registered parent board");

  // Unincorporated county → Planning & Building, which has parent Planning Commission
  const input = baseSnapshot({ property: { apn: "004-004-004", address: "", city: "", zoning: "" } });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const oversight = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "overseen_by" &&
    p.source_id === "auth.hc.planning_building" &&
    p.target_id === "auth.hc.planning_commission" &&
    p.target_type === "authority", // board entity_type maps to node type "authority"
  );
  assert(oversight.length === 1, "Should propose department -> overseen_by -> board");
  assert(oversight[0]?.confidence === 0.8, "Reference-data hierarchy should carry higher confidence than the case-specific inference it depends on");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals`);
}

// ── Test Case 5: Named decision-maker from permit data ───────────────────────

async function testNamedDecisionMaker() {
  console.log("\nTest 5: Permit names an assigned inspector");

  const input = baseSnapshot({
    property: { apn: "005-005-005", address: "", city: "", zoning: "" },
    permits: [{
      id: "permit_1", permit_number: "BP-2026-005", permit_type: "building",
      permit_status: "issued", issued_date: "2026-01-01", expired_date: null, finalized_date: null,
      assigned_inspector: "Jane Doe",
    }],
  });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const issuedBy = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "issued_by" &&
    p.source_type === "permit" && p.source_id === "permit_1" &&
    p.target_type === "official" && p.target_id === "official.named.jane-doe",
  );
  assert(issuedBy.length === 1, "Should propose permit -> issued_by -> official.named.jane-doe");

  // Contract shape: "case -> overseen_by -> official (if known)"
  const caseOverseenBy = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "overseen_by" &&
    p.source_type === "case" && p.source_id === "case_1" &&
    p.target_type === "official" && p.target_id === "official.named.jane-doe",
  );
  assert(caseOverseenBy.length === 1, "Should propose case -> overseen_by -> official per the evaluation contract's named-official shape");

  const memberOf = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.relationship_type === "member_of" &&
    p.source_type === "official" && p.source_id === "official.named.jane-doe" &&
    p.target_id === "auth.hc.planning_building",
  );
  assert(memberOf.length === 1, "Should propose official -> member_of -> matched department");

  // Named official present → the missing-decision-maker rule should NOT fire
  const missingDM = result.proposals.filter(p =>
    p.proposal_type === "missing_info" &&
    (p.reasoning_trace ?? "").includes("no permit on this case names"),
  );
  assert(missingDM.length === 0, "Should NOT flag a missing decision-maker when one is already named");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals`);
}

// ── Test Case 6: Missing decision-maker (department known, no named person) ─

async function testMissingDecisionMaker() {
  console.log("\nTest 6: Department resolved, open finding exists, but no named official anywhere");

  const input = baseSnapshot({
    property: { apn: "006-006-006", address: "", city: "", zoning: "" },
    findings: [{ id: "f1", rule: "missing_notice", rule_name: "Missing Notice", severity: "warning", status: "open", detail: null, evidence_id: null }],
    permits: [{
      id: "permit_2", permit_number: "BP-2026-006", permit_type: "building",
      permit_status: "issued", issued_date: "2026-01-01", expired_date: null, finalized_date: null,
      assigned_inspector: null,
    }],
  });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const missingDM = result.proposals.filter(p =>
    p.proposal_type === "missing_info" &&
    p.importance === "optional" &&
    (p.reasoning_trace ?? "").includes("no permit on this case names"),
  );
  assert(missingDM.length === 1, "Should flag missing decision-maker when jurisdiction is known but no official is named and a finding is open");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals`);
}

// ── Test Case 7: No open findings — missing decision-maker rule stays quiet ──

async function testNoOpenFindingsNoNoise() {
  console.log("\nTest 7: No open findings — should not flag a missing decision-maker");

  const input = baseSnapshot({
    property: { apn: "007-007-007", address: "", city: "", zoning: "" },
    findings: [{ id: "f2", rule: "missing_notice", rule_name: "Missing Notice", severity: "warning", status: "resolved", detail: null, evidence_id: null }],
  });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const missingDM = result.proposals.filter(p => p.proposal_type === "missing_info" && p.importance === "optional");
  assert(missingDM.length === 0, "Should NOT flag missing decision-maker when there are no open findings");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals, no false positive`);
}

// ── Test Case 8: Capability enforcement — never emits observation/procedural_check ──

async function testCapabilityEnforcement() {
  console.log("\nTest 8: Agent output never includes forbidden proposal types for its capability set");

  const input = baseSnapshot({
    property: { apn: "008-008-008", address: "", city: "Eureka", zoning: "" },
    permits: [{
      id: "permit_3", permit_number: "BP-2026-008", permit_type: "building",
      permit_status: "issued", issued_date: "2026-01-01", expired_date: null, finalized_date: null,
      assigned_inspector: "John Q. Public",
    }],
    findings: [{ id: "f3", rule: "no_hearing", rule_name: "No Hearing", severity: "critical", status: "open", detail: null, evidence_id: null }],
  });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const disallowed = result.proposals.filter(
    p => p.proposal_type === "observation" || p.proposal_type === "procedural_check",
  );
  assert(disallowed.length === 0, "authority_mapper is not allowed to emit observation/procedural_check proposals");

  for (const p of result.proposals) {
    assert(p.confidence <= 0.9, `Confidence ${p.confidence} exceeds this agent's stated ceiling`);
  }

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals, all within capability`);
}

// ── Test Case 9: Ambiguous jurisdiction (phase-3-evaluation-contract.md §4.2) ──
//
// Exact scenario from the frozen contract: a city name that is not one of
// the incorporated cities the agent knows about (McKinleyville is an
// unincorporated Humboldt community, not a city government). Forbidden:
// assuming county jurisdiction without verification just because the city
// field doesn't match a known incorporated authority.

async function testAmbiguousJurisdiction() {
  console.log("\nTest 9: Ambiguous jurisdiction — unrecognized city, must not assume county (contract §4.2)");

  const input = baseSnapshot({
    property: { apn: "123-456-789", address: "Unincorporated County", city: "McKinleyville", zoning: "rural" },
  });
  const result = await AUTHORITY_MAPPER_AGENT.execute(input);

  const jurisdiction = result.proposals.filter(p => p.relationship_type === "jurisdiction_of");
  const missing = result.proposals.filter(p => p.proposal_type === "missing_info" && p.info_type === "authority");

  // Contract: EITHER a lower-confidence relationship_proposal OR missing_info
  assert(jurisdiction.length === 0 || jurisdiction.every(p => p.confidence < 0.8), "A jurisdiction proposal for an unrecognized city must not be high-confidence");
  assert(jurisdiction.length > 0 || missing.length > 0, "Must produce either a (low-confidence) jurisdiction proposal or missing_info — not silence");

  // Forbidden: assuming unincorporated-county jurisdiction just because the
  // named city wasn't recognized. This agent's design deliberately treats
  // "unrecognized city" and "no city at all" as different cases — silently
  // falling back to the county department here would be exactly the
  // forbidden "assuming county jurisdiction without verification".
  const wronglyAssumedCounty = result.proposals.some(
    p => p.relationship_type === "jurisdiction_of" && p.target_id === "auth.hc.planning_building",
  );
  assert(!wronglyAssumedCounty, "Should NOT fall back to unincorporated-county jurisdiction for an unrecognized (but present) city value");

  assertNoForbidden(result.proposals, "authority_mapper");
  console.log(`  ✓ ${result.proposals.length} proposals, no unverified county assumption`);
}

// ── Run all tests ────────────────────────────────────────────────────────────

async function runAll() {
  console.log("═══ Authority Mapper Agent — Evaluation Suite ═══");
  console.log(`Agent: ${AUTHORITY_MAPPER_AGENT.definition.id} v${AUTHORITY_MAPPER_AGENT.definition.version}`);

  await testUnincorporatedJurisdiction();
  await testCityJurisdiction();
  await testUnknownCity();
  await testOversightChain();
  await testNamedDecisionMaker();
  await testMissingDecisionMaker();
  await testNoOpenFindingsNoNoise();
  await testCapabilityEnforcement();
  await testAmbiguousJurisdiction();

  console.log("\n═══ Results ═══");
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailures:");
    failures.forEach(f => console.log(`  ❌ ${f}`));
    process.exit(1);
  } else {
    console.log("\n  ✅ All tests passed — agent approved for deployment");
  }
}

runAll().catch(console.error);
