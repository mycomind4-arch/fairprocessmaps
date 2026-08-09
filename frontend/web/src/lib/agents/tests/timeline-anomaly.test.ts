/**
 * Timeline Anomaly Agent — Evaluation Test Suite
 *
 * Validates required outputs (expected) and forbidden outputs (must not appear).
 * An agent that fails any test case cannot deploy to production.
 *
 * Run via: npx tsx frontend/web/src/lib/agents/tests/timeline-anomaly.test.ts
 */

import { TIMELINE_ANOMALY_AGENT } from "../timeline-anomaly";
import { validateAgentOutput } from "../validator";
import type { AgentInputSnapshot, AgentProposalDraft } from "../types";

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

// ── Test Case 1: Insufficient Notice Period ─────────────────────────────────

async function testInsufficientNotice() {
  console.log("\nTest 1: Insufficient notice period (2 days, required 10)");

  const input: AgentInputSnapshot = {
    case_id: "test_1",
    organization_id: "org_test",
    case_name: "Test Case 1",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [],
    ce_cases: [{
      id: "ce_1",
      case_number: "CE-2026-001",
      violation_type: "nuisance",
      status: "open",
      notice_served_date: "2026-03-10",
      notice_period_days: 10,
      compliance_deadline: "2026-06-10",
      hearing_date: "2026-03-12", // 2 days after notice — insufficient
    }],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: observation with sequence_anomaly
  const obs = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "sequence_anomaly"
  );
  assert(obs.length > 0, "Should produce sequence_anomaly observation");

  // Expected: procedural check with status=missing
  const checks = result.proposals.filter(p =>
    p.proposal_type === "procedural_check" && p.check_status === "missing"
  );
  assert(checks.length > 0, "Should produce procedural_check with status=missing");

  // Expected: severity critical (interval < 3)
  assert(obs[0]?.severity === "critical", "Severity should be critical for <3 day interval");

  // Forbidden: no legal conclusions
  assertNoForbidden(result.proposals, "timeline_anomaly");

  // Forbidden: no relationship_proposal
  const rels = result.proposals.filter(p => p.proposal_type === "relationship_proposal");
  assert(rels.length === 0, "Should NOT produce relationship_proposal");

  // Forbidden: no "violation" in any text
  const allText = result.proposals.map(p =>
    [p.description, p.check_detail, p.reasoning_trace].filter(Boolean).join(" ")
  ).join(" ").toLowerCase();
  assert(!allText.includes("violation"), "Should not contain 'violation'");
  assert(!allText.includes("illegal"), "Should not contain 'illegal'");
  assert(!allText.includes("unlawful"), "Should not contain 'unlawful'");

  console.log(`  ✓ ${result.proposals.length} proposals, all neutral`);
}

// ── Test Case 2: Missing Service Date ────────────────────────────────────────

async function testMissingNotice() {
  console.log("\nTest 2: Missing notice service date (hearing exists)");

  const input: AgentInputSnapshot = {
    case_id: "test_2",
    organization_id: "org_test",
    case_name: "Test Case 2",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [],
    ce_cases: [{
      id: "ce_2",
      case_number: "CE-2026-002",
      violation_type: "substandard",
      status: "open",
      notice_served_date: null, // missing!
      notice_period_days: 10,
      compliance_deadline: "2026-06-10",
      hearing_date: "2026-03-20",
    }],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: observation with missing_notice
  const obs = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "missing_notice"
  );
  assert(obs.length > 0, "Should produce missing_notice observation");

  // Expected: procedural_check with status=unclear
  const unclear = result.proposals.filter(p =>
    p.proposal_type === "procedural_check" && p.check_status === "unclear"
  );
  assert(unclear.length > 0, "Should produce procedural_check with status=unclear");

  // Expected: missing_info with type=date, importance=critical
  const missingInfo = result.proposals.filter(p =>
    p.proposal_type === "missing_info" && p.info_type === "date" && p.importance === "critical"
  );
  assert(missingInfo.length > 0, "Should produce missing_info (date, critical)");

  // Forbidden: no conclusion that notice was NOT served
  const allText = result.proposals.map(p => p.description ?? "").join(" ").toLowerCase();
  assert(!allText.includes("notice was not served"), "Should not conclude notice was not served");

  assertNoForbidden(result.proposals, "timeline_anomaly");
  console.log(`  ✓ ${result.proposals.length} proposals, all neutral`);
}

// ── Test Case 3: Compliant Timeline ─────────────────────────────────────────

async function testCompliantTimeline() {
  console.log("\nTest 3: Compliant timeline (45 days notice, deadline not passed)");

  const input: AgentInputSnapshot = {
    case_id: "test_3",
    organization_id: "org_test",
    case_name: "Test Case 3",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [],
    ce_cases: [{
      id: "ce_3",
      case_number: "CE-2026-003",
      violation_type: "nuisance",
      status: "open",
      notice_served_date: "2026-01-01",
      notice_period_days: 10,
      compliance_deadline: "2026-12-31", // far future
      hearing_date: "2026-02-15", // 45 days after notice — compliant
    }],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: procedural_check with status=met
  const met = result.proposals.filter(p =>
    p.proposal_type === "procedural_check" && p.check_status === "met"
  );
  assert(met.length > 0, "Should produce procedural_check with status=met");

  // Forbidden: no sequence_anomaly observations
  const anomalies = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "sequence_anomaly"
  );
  assert(anomalies.length === 0, "Should NOT produce sequence_anomaly for compliant timeline");

  // Forbidden: no deadline_passed observations
  const deadlines = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "deadline_passed"
  );
  assert(deadlines.length === 0, "Should NOT produce deadline_passed for future deadline");

  assertNoForbidden(result.proposals, "timeline_anomaly");
  console.log(`  ✓ ${result.proposals.length} proposals, no false positives`);
}

// ── Test Case 4: Timeline Gap ───────────────────────────────────────────────

async function testTimelineGap() {
  console.log("\nTest 4: Timeline gap (>90 days between events)");

  const input: AgentInputSnapshot = {
    case_id: "test_4",
    organization_id: "org_test",
    case_name: "Test Case 4",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [
      { id: "ev_1", event_date: "2026-01-15", event_type: "ce.notice_served", description: "Notice served", evidence_id: null },
      { id: "ev_2", event_date: "2026-06-20", event_type: "ce.hearing_scheduled", description: "Hearing scheduled", evidence_id: null },
    ],
    evidence: [],
    findings: [],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: observation with timeline_gap
  const gaps = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "timeline_gap"
  );
  assert(gaps.length > 0, "Should produce timeline_gap observation");

  // Expected: severity info (not critical)
  assert(gaps[0]?.severity === "info", "Timeline gap should be severity=info");

  assertNoForbidden(result.proposals, "timeline_anomaly");
  console.log(`  ✓ ${result.proposals.length} proposals, gap detected`);
}

// ── Test Case 5: Hearing Before Service (temporal inversion) ─────────────────

async function testHearingBeforeService() {
  console.log("\nTest 5: Hearing before service (temporal inversion)");

  const input: AgentInputSnapshot = {
    case_id: "test_5",
    organization_id: "org_test",
    case_name: "Test Case 5",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [],
    evidence: [],
    findings: [],
    ce_cases: [{
      id: "ce_5",
      case_number: "CE-2026-005",
      violation_type: "nuisance",
      status: "open",
      notice_served_date: "2026-03-20",
      notice_period_days: 10,
      compliance_deadline: "2026-06-20",
      hearing_date: "2026-03-15", // 5 days BEFORE notice!
    }],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: observation with sequence_anomaly, severity critical
  const obs = result.proposals.filter(p =>
    p.proposal_type === "observation" && p.observation_type === "sequence_anomaly"
  );
  assert(obs.length > 0, "Should produce sequence_anomaly for hearing before service");
  assert(obs[0]?.severity === "critical", "Temporal inversion should be critical severity");

  assertNoForbidden(result.proposals, "timeline_anomaly");
  console.log(`  ✓ ${result.proposals.length} proposals, inversion detected`);
}

// ── Test Case 6: Empty case (no false positives) ────────────────────────────

async function testEmptyCase() {
  console.log("\nTest 6: Empty case (no CE cases, no permits, minimal timeline)");

  const input: AgentInputSnapshot = {
    case_id: "test_6",
    organization_id: "org_test",
    case_name: "Test Case 6",
    case_type: "code_enforcement",
    jurisdiction: "Humboldt County",
    property: { apn: "", address: "", city: "", zoning: "" },
    timeline: [
      { id: "ev_1", event_date: "2026-01-01", event_type: "case.opened", description: "Case opened", evidence_id: null },
    ],
    evidence: [],
    findings: [],
    ce_cases: [],
    permits: [],
    relationships: [],
    statutes: [],
  };

  const result = await TIMELINE_ANOMALY_AGENT.execute(input);

  // Expected: no observations, no checks, no missing info
  assert(result.proposals.length === 0, "Should produce 0 proposals for empty/minimal case");

  console.log(`  ✓ 0 proposals (no false positives)`);
}

// ── Run all tests ────────────────────────────────────────────────────────────

async function runAll() {
  console.log("═══ Timeline Anomaly Agent — Evaluation Suite ═══");
  console.log(`Agent: ${TIMELINE_ANOMALY_AGENT.definition.id} v${TIMELINE_ANOMALY_AGENT.definition.version}`);

  await testInsufficientNotice();
  await testMissingNotice();
  await testCompliantTimeline();
  await testTimelineGap();
  await testHearingBeforeService();
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
