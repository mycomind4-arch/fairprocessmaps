/**
 * Statute Matcher Agent — Evaluation Test Suite
 *
 * Validates that the agent:
 *   - Proposes correct mandated_by relationships
 *   - Uses neutral language (no legal conclusions)
 *   - Produces appropriate confidence scores (< 0.95)
 *   - Does NOT produce findings, legal conclusions, or authority determinations
 *
 * Run via: npx tsx frontend/web/src/lib/agents/tests/statute-matcher.test.ts
 */

import { STATUTE_MATCHER_AGENT } from "../statute-matcher";
import { validateAgentOutput } from "../validator";
import type { AgentInputSnapshot, AgentProposalDraft } from "../types";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) { passed++; } else {
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

// ── Test Case 1: Missing notice finding → statute match ──────────────────────

async function testMissingNoticeMatch() {
  console.log("\nTest 1: Missing notice finding → statute match");

  const input: AgentInputSnapshot = {
    case_id: "test_1",
    organization_id: "org_test",
    case_name: "Test Case 1",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [{ id: "evi_001", title: "Notice of Violation", doc_type: "notice", status: "active", source: "county_portal" }],
    findings: [{
      id: "finding_1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "open",
      detail: "Hearing occurred 3 days after notice, minimum required is 10 days. Notice service documentation is incomplete.",
      evidence_id: "evi_001",
    }],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);

  // Expected: at least one relationship_proposal
  const relProps = result.proposals.filter(p => p.proposal_type === "relationship_proposal");
  assert(relProps.length > 0, "Should produce at least one relationship_proposal");

  // Expected: relationship type is mandated_by
  assert(relProps.every(p => p.relationship_type === "mandated_by"),
    "All relationship proposals should be mandated_by");

  // Expected: target_type is statute
  assert(relProps.every(p => p.target_type === "statute"),
    "All relationship proposals should target a statute");

  // Expected: source_type is finding
  assert(relProps.every(p => p.source_type === "finding"),
    "All relationship proposals should source from a finding");

  // Expected: confidence is reasonable (not too high, not too low)
  const conf = relProps[0]?.confidence ?? 0;
  assert(conf > 0.3, `Confidence should be > 0.3, got ${conf}`);
  assert(conf <= 0.9, `Confidence should be <= 0.9, got ${conf}`);

  // Expected: evidence_ids are populated
  assert(relProps[0]?.evidence_ids?.length === 1, "Should include evidence_id from finding");

  // Forbidden: no legal conclusions
  assertNoForbidden(result.proposals, "statute_matcher");

  // Forbidden: no "violation" in any text
  const allText = result.proposals.map(p =>
    [p.description, p.reasoning_trace].filter(Boolean).join(" ")
  ).join(" ").toLowerCase();
  assert(!allText.includes("violation"), "Should not contain 'violation'");
  assert(!allText.includes("applies because"), "Should not contain 'applies because'");
  assert(!allText.includes("violates"), "Should not contain 'violates'");

  console.log(`  ✓ ${result.proposals.length} proposals, confidence=${conf.toFixed(2)}`);
}

// ── Test Case 2: Nuisance finding → nuisance statute ─────────────────────────

async function testNuisanceMatch() {
  console.log("\nTest 2: Nuisance finding → nuisance statute match");

  const input: AgentInputSnapshot = {
    case_id: "test_2",
    organization_id: "org_test",
    case_name: "Test Case 2",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [{
      id: "finding_2",
      rule: "nuisance",
      rule_name: "Public Nuisance",
      severity: "warning",
      status: "open",
      detail: "Property contains accumulated debris and junk constituting a public nuisance. Abatement may be required.",
      evidence_id: null,
    }],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);

  const relProps = result.proposals.filter(p => p.proposal_type === "relationship_proposal");
  assert(relProps.length > 0, "Should produce relationship_proposal for nuisance finding");

  // Expected: should match a nuisance statute (HCC § 312.0 or CC § 3479)
  const matchedStatutes = relProps.map(p => p.target_id);
  assert(
    matchedStatutes.includes("statute.hcc.312") || matchedStatutes.includes("statute.cc.3479"),
    "Should match a nuisance statute (HCC § 312.0 or CC § 3479)"
  );

  assertNoForbidden(result.proposals, "statute_matcher");
  console.log(`  ✓ ${relProps.length} match(es), statutes: ${matchedStatutes.join(", ")}`);
}

// ── Test Case 3: Ambiguous finding (no clear match) ──────────────────────────

async function testAmbiguousMatch() {
  console.log("\nTest 3: Ambiguous finding (no clear category)");

  const input: AgentInputSnapshot = {
    case_id: "test_3",
    organization_id: "org_test",
    case_name: "Test Case 3",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [{
      id: "finding_3",
      rule: "unknown_issue",
      rule_name: "Unusual Condition",
      severity: "info",
      status: "open",
      detail: "Property has an unusual condition that doesn't clearly map to any known violation category.",
      evidence_id: null,
    }],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);

  const relProps = result.proposals.filter(p => p.proposal_type === "relationship_proposal");

  // Expected: either no proposal, or a low-confidence proposal
  // (better to not propose than to propose wrong)
  if (relProps.length > 0) {
    const conf = relProps[0]?.confidence ?? 0;
    assert(conf < 0.5, `Ambiguous match should have low confidence, got ${conf}`);
    console.log(`  ✓ Low-confidence match: ${conf.toFixed(2)}`);
  } else {
    assert(true, "No proposal for ambiguous finding (acceptable)");
    console.log(`  ✓ No proposal (acceptable for ambiguous case)`);
  }

  assertNoForbidden(result.proposals, "statute_matcher");
}

// ── Test Case 4: Closed finding (should be skipped) ──────────────────────────

async function testClosedFindingSkipped() {
  console.log("\nTest 4: Closed/resolved finding (should be skipped)");

  const input: AgentInputSnapshot = {
    case_id: "test_4",
    organization_id: "org_test",
    case_name: "Test Case 4",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [{
      id: "finding_4",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "closed",
      detail: "Notice period issue resolved.",
      evidence_id: null,
    }],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);

  const relProps = result.proposals.filter(p => p.proposal_type === "relationship_proposal");
  assert(relProps.length === 0, "Should NOT produce proposals for closed findings");

  console.log(`  ✓ 0 proposals (closed finding skipped)`);
}

// ── Test Case 5: Multiple findings → multiple matches ───────────────────────

async function testMultipleFindings() {
  console.log("\nTest 5: Multiple findings → multiple statute matches");

  const input: AgentInputSnapshot = {
    case_id: "test_5",
    organization_id: "org_test",
    case_name: "Test Case 5",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [
      {
        id: "finding_5a",
        rule: "missing_notice",
        rule_name: "Missing Notice Period",
        severity: "warning",
        status: "open",
        detail: "Notice service date not documented before hearing.",
        evidence_id: null,
      },
      {
        id: "finding_5b",
        rule: "substandard",
        rule_name: "Substandard Housing Conditions",
        severity: "critical",
        status: "open",
        detail: "Property has substandard housing conditions including lack of habitable facilities.",
        evidence_id: null,
      },
    ],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);

  const relProps = result.proposals.filter(p => p.proposal_type === "relationship_proposal");
  assert(relProps.length >= 2, `Should produce at least 2 relationship_proposals, got ${relProps.length}`);

  // Each finding should have at most one relationship proposal (deduplication)
  const findingIds = relProps.map(p => p.source_id);
  const uniqueFindings = new Set(findingIds);
  assert(uniqueFindings.size === findingIds.length, "Each finding should have at most one proposal");

  // Verify different statutes for different findings
  const targetIds = relProps.map(p => p.target_id);
  assert(new Set(targetIds).size >= 2, "Should match different statutes for different findings");

  assertNoForbidden(result.proposals, "statute_matcher");
  console.log(`  ✓ ${relProps.length} proposals for ${uniqueFindings.size} findings`);
}

// ── Test Case 6: Empty case (no findings) ────────────────────────────────────

async function testEmptyCase() {
  console.log("\nTest 6: Empty case (no findings)");

  const input: AgentInputSnapshot = {
    case_id: "test_6",
    organization_id: "org_test",
    case_name: "Test Case 6",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await STATUTE_MATCHER_AGENT.execute(input);
  assert(result.proposals.length === 0, "Should produce 0 proposals with no findings");

  console.log(`  ✓ 0 proposals (no findings)`);
}

// ── Run all tests ────────────────────────────────────────────────────────────

async function runAll() {
  console.log("═══ Statute Matcher Agent — Evaluation Suite ═══");
  console.log(`Agent: ${STATUTE_MATCHER_AGENT.definition.id} v${STATUTE_MATCHER_AGENT.definition.version}`);

  await testMissingNoticeMatch();
  await testNuisanceMatch();
  await testAmbiguousMatch();
  await testClosedFindingSkipped();
  await testMultipleFindings();
  await testEmptyCase();

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
