/**
 * Evidence Extractor Agent — Evaluation Test Suite
 *
 * Validates that the agent:
 *   - Proposes correct evidence→finding and evidence→timeline relationships
 *   - Detects evidence gaps (findings without supporting evidence)
 *   - Flags unlinked and withdrawn evidence
 *   - Uses neutral language (no legal conclusions)
 *   - Produces appropriate confidence scores (< 0.95)
 *   - Does NOT produce procedural checks, missing_info, or legal conclusions
 *
 * Run via: npx tsx frontend/web/src/lib/agents/tests/evidence-extractor.test.ts
 */

import { EVIDENCE_EXTRACTOR_AGENT } from "../evidence-extractor";
import { validateAgentOutput } from "../validator";
import type { AgentInputSnapshot, AgentProposalDraft } from "../types";

// ── Test framework ──────────────────────────────────────────────────────────

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

function baseSnapshot(overrides: Partial<AgentInputSnapshot> = {}): AgentInputSnapshot {
  return {
    case_id: "test",
    organization_id: "org_test",
    case_name: "Test Case",
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
    ...overrides,
  };
}

// ── Test Case 1: Finding without evidence → evidence_gap observation ───────

async function testFindingWithoutEvidence() {
  console.log("\nTest 1: Finding without evidence → evidence_gap observation");

  const input = baseSnapshot({
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "open",
      detail: "Hearing date recorded but no notice service date.",
      evidence_id: null,
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  const gaps = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "evidence_gap"
  );
  assert(gaps.length > 0, "Should produce evidence_gap observation");

  const relatedToFinding = gaps.filter(p => p.related_entity_id === "f1");
  assert(relatedToFinding.length > 0, "Observation should relate to the finding");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ ${result.proposals.length} proposals, gap detected`);
}

// ── Test Case 2: Evidence → Finding match (doc_type mapping) ────────────────

async function testEvidenceFindingMatch() {
  console.log("\nTest 2: Evidence → Finding match by doc_type");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Notice of Violation CE-2026-001",
      doc_type: "notice",
      status: "active",
      source: "county_portal",
    }],
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "open",
      detail: "No notice service date documented before hearing.",
      evidence_id: null, // not linked yet
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  const relProps = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.source_type === "evidence" && p.target_type === "finding"
  );
  assert(relProps.length > 0, "Should produce evidence→finding relationship_proposal");

  assert(relProps.every(p => p.relationship_type === "supports"),
    "Relationship type should be 'supports'");

  assert(relProps.every(p => p.source_id === "ev1"), "Source should be the evidence");
  assert(relProps.every(p => p.target_id === "f1"), "Target should be the finding");

  const conf = relProps[0]?.confidence ?? 0;
  assert(conf > 0.25, `Confidence should be > 0.25, got ${conf}`);
  assert(conf <= 0.85, `Confidence should be <= 0.85, got ${conf}`);

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ ${relProps.length} relationship(s), confidence=${conf.toFixed(2)}`);
}

// ── Test Case 3: Evidence → Timeline event match ────────────────────────────

async function testEvidenceTimelineMatch() {
  console.log("\nTest 3: Evidence → Timeline event match by doc_type");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Notice of Violation",
      doc_type: "notice",
      status: "active",
      source: "county_portal",
    }],
    timeline: [{
      id: "ev1",
      event_date: "2026-03-10",
      event_type: "ce.notice_served",
      description: "Notice of Violation served to property owner",
      evidence_id: null, // not linked yet
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  const relProps = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.source_type === "evidence" && p.target_type === "timeline_event"
  );
  assert(relProps.length > 0, "Should produce evidence→timeline relationship_proposal");

  assert(relProps.every(p => p.relationship_type === "documents"),
    "Relationship type should be 'documents'");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ ${relProps.length} relationship(s) to timeline events`);
}

// ── Test Case 4: Unlinked evidence → observation ────────────────────────────

async function testUnlinkedEvidence() {
  console.log("\nTest 4: Unlinked evidence → observation");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Random Photo",
      doc_type: "photo",
      status: "active",
      source: "user_upload",
    }],
    // No findings, no timeline events — evidence is orphaned
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  const unlinked = result.proposals.filter(p =>
    p.proposal_type === "observation" &&
    p.observation_type === "evidence_gap" &&
    p.related_entity_type === "evidence"
  );
  assert(unlinked.length > 0, "Should produce observation for unlinked evidence");

  assert(unlinked.every(p => p.severity === "info"),
    "Unlinked evidence observation should be severity=info");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ ${unlinked.length} observation(s) for unlinked evidence`);
}

// ── Test Case 5: Withdrawn evidence linked to active finding ─────────────────

async function testWithdrawnEvidence() {
  console.log("\nTest 5: Withdrawn evidence linked to active finding");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Notice of Violation",
      doc_type: "notice",
      status: "withdrawn",
      source: "county_portal",
    }],
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "open",
      detail: "No notice service date.",
      evidence_id: "ev1", // still linked despite withdrawal
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  const withdrawnObs = result.proposals.filter(p =>
    p.proposal_type === "observation" &&
    p.observation_type === "evidence_gap" &&
    p.related_entity_id === "f1" &&
    p.severity === "warning"
  );
  assert(withdrawnObs.length > 0, "Should produce warning observation for withdrawn evidence linked to active finding");

  // Should NOT propose new relationships for withdrawn evidence
  const relProps = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" && p.source_id === "ev1"
  );
  assert(relProps.length === 0, "Should NOT propose relationships from withdrawn evidence");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ ${withdrawnObs.length} warning observation(s) for withdrawn evidence`);
}

// ── Test Case 6: Already-linked evidence (no duplicate proposals) ────────────

async function testAlreadyLinkedEvidence() {
  console.log("\nTest 6: Already-linked evidence (no duplicate proposals)");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Notice of Violation",
      doc_type: "notice",
      status: "active",
      source: "county_portal",
    }],
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "open",
      detail: "No notice service date documented.",
      evidence_id: "ev1", // already linked
    }],
    timeline: [{
      id: "t1",
      event_date: "2026-03-10",
      event_type: "ce.notice_served",
      description: "Notice served",
      evidence_id: "ev1", // already linked
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  // Should NOT produce relationship_proposal to finding (already linked)
  const findingRels = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.source_id === "ev1" && p.target_id === "f1"
  );
  assert(findingRels.length === 0, "Should NOT propose relationship to already-linked finding");

  // Should NOT produce relationship_proposal to timeline event (already linked)
  const eventRels = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" &&
    p.source_id === "ev1" && p.target_id === "t1"
  );
  assert(eventRels.length === 0, "Should NOT propose relationship to already-linked timeline event");

  // Should NOT produce unlinked evidence observation (it IS linked)
  const unlinked = result.proposals.filter(p =>
    p.proposal_type === "observation" &&
    p.observation_type === "evidence_gap" &&
    p.related_entity_id === "ev1"
  );
  assert(unlinked.length === 0, "Should NOT produce unlinked observation for linked evidence");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ No duplicate proposals for already-linked evidence`);
}

// ── Test Case 7: Empty case (no false positives) ────────────────────────────

async function testEmptyCase() {
  console.log("\nTest 7: Empty case (no false positives)");

  const input = baseSnapshot();

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  assert(result.proposals.length === 0, "Should produce 0 proposals for empty case");

  console.log(`  ✓ 0 proposals (clean empty case)`);
}

// ── Test Case 8: Neutral language enforcement ────────────────────────────────

async function testNeutralLanguage() {
  console.log("\nTest 8: Neutral language enforcement");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Compliance Certificate",
      doc_type: "compliance",
      status: "active",
      source: "county_portal",
    }],
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "critical",
      status: "open",
      detail: "No notice service date documented before hearing occurred.",
      evidence_id: null,
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  // Check all text fields for forbidden phrases
  const allText = result.proposals.map(p =>
    [p.description, p.reasoning_trace, p.relationship_type].filter(Boolean).join(" ")
  ).join(" ").toLowerCase();

  assert(!allText.includes("proves"), "Should not contain 'proves'");
  assert(!allText.includes("establishes"), "Should not contain 'establishes'");
  assert(!allText.includes("demonstrates compliance"), "Should not contain 'demonstrates compliance'");
  assert(!allText.includes("satisfies"), "Should not contain 'satisfies'");
  assert(!allText.includes("complies with"), "Should not contain 'complies with'");
  assert(!allText.includes("violation"), "Should not contain 'violation'");
  assert(!allText.includes("illegal"), "Should not contain 'illegal'");
  assert(!allText.includes("unlawful"), "Should not contain 'unlawful'");

  assertNoForbidden(result.proposals, "evidence_extractor");
  console.log(`  ✓ All language is neutral`);
}

// ── Test Case 9: Closed findings are skipped ────────────────────────────────

async function testClosedFindingsSkipped() {
  console.log("\nTest 9: Closed findings are skipped");

  const input = baseSnapshot({
    evidence: [{
      id: "ev1",
      title: "Notice of Violation",
      doc_type: "notice",
      status: "active",
      source: "county_portal",
    }],
    findings: [{
      id: "f1",
      rule: "missing_notice",
      rule_name: "Missing Notice Period",
      severity: "warning",
      status: "closed",
      detail: "Issue resolved.",
      evidence_id: null,
    }],
  });

  const result = await EVIDENCE_EXTRACTOR_AGENT.execute(input);

  // Should NOT produce evidence_gap for closed finding
  const gapForClosed = result.proposals.filter(p =>
    p.proposal_type === "observation" &&
    p.observation_type === "evidence_gap" &&
    p.related_entity_id === "f1"
  );
  assert(gapForClosed.length === 0, "Should NOT produce evidence_gap for closed finding");

  // Should NOT propose relationship to closed finding
  const relToClosed = result.proposals.filter(p =>
    p.proposal_type === "relationship_proposal" && p.target_id === "f1"
  );
  assert(relToClosed.length === 0, "Should NOT propose relationship to closed finding");

  console.log(`  ✓ Closed finding correctly skipped`);
}

// ── Run all tests ────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  Evidence Extractor Agent — Evaluation Test Suite");
  console.log("═══════════════════════════════════════════════════════════════");

  await testFindingWithoutEvidence();
  await testEvidenceFindingMatch();
  await testEvidenceTimelineMatch();
  await testUnlinkedEvidence();
  await testWithdrawnEvidence();
  await testAlreadyLinkedEvidence();
  await testEmptyCase();
  await testNeutralLanguage();
  await testClosedFindingsSkipped();

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("  Failures:");
    failures.forEach(f => console.log(`    ❌ ${f}`));
  }
  console.log("═══════════════════════════════════════════════════════════════");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
