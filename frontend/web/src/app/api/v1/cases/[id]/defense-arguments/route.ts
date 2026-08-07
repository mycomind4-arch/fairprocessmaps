import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, resolveProjectOrg, verifyOrgAccess } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { emitAuditEvent, humanActor } from "@/lib/security/events";

export const runtime = "nodejs";

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_title: string | null;
}

interface DefenseArgument {
  id: string;
  title: string;
  category: "procedural" | "substantive" | "evidentiary";
  status: "draft" | "strengthening" | "ready";
  findings: string[];
  description: string;
}

/**
 * Generate defense arguments from due-process findings and timeline events.
 *
 * Strategy:
 * - Each critical finding with a procedural rule becomes a procedural defense argument.
 * - Missing evidence or gaps in the timeline become evidentiary arguments.
 * - Severity-based categorization: critical → procedural, warning → substantive, info → evidentiary.
 * - Arguments are linked back to their source finding IDs for traceability.
 */
function buildDefenseArguments(
  findings: Finding[],
  timeline: TimelineEvent[],
): DefenseArgument[] {
  const arguments_: DefenseArgument[] = [];

  // Group findings by rule to avoid duplicate arguments
  const findingsByRule = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.status === "dismissed") continue;
    const group = findingsByRule.get(f.rule) ?? [];
    group.push(f);
    findingsByRule.set(f.rule, group);
  }

  let argIdx = 0;

  // ── Procedural defenses from critical findings ──
  const proceduralRules = [
    "notice_timing",
    "hearing_right",
    "abatement_without_notice",
  ];

  for (const rule of proceduralRules) {
    const group = findingsByRule.get(rule);
    if (!group || group.length === 0) continue;

    const findingIds = group.map((f) => f.id);
    const details = group.map((f) => f.detail || f.rule_name || "Due-process violation detected").join("; ");
    const allCritical = group.every((f) => f.severity === "critical");

    const titleMap: Record<string, string> = {
      notice_timing: "Insufficient or Missing Notice Period",
      hearing_right: "Denial of Right to Hearing",
      abatement_without_notice: "Abatement Without Proper Notice",
    };

    arguments_.push({
      id: `arg_${++argIdx}`,
      title: titleMap[rule] || `${rule.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
      category: "procedural",
      status: allCritical ? "ready" : "draft",
      findings: findingIds,
      description: details,
    });
  }

  // ── Substantive defenses from warning findings ──
  const substantiveRules = [
    "appeal_pathway",
    "permit_review_right",
    "ce_outcome_review",
  ];

  for (const rule of substantiveRules) {
    const group = findingsByRule.get(rule);
    if (!group || group.length === 0) continue;

    const findingIds = group.map((f) => f.id);
    const details = group.map((f) => f.detail || f.rule_name || "Procedural deficiency detected").join("; ");

    const titleMap: Record<string, string> = {
      appeal_pathway: "Failure to Provide Appeal Information",
      permit_review_right: "Permit Denied Without Review Opportunity",
      ce_outcome_review: "Case Closed Without Appeal Opportunity",
    };

    arguments_.push({
      id: `arg_${++argIdx}`,
      title: titleMap[rule] || `${rule.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}`,
      category: "substantive",
      status: "draft",
      findings: findingIds,
      description: details,
    });
  }

  // ── Evidentiary defenses from timeline gaps ──
  // Detect events that should have evidence attached but don't
  const eventsWithoutEvidence = timeline.filter(
    (e) =>
      ["notice_sent", "hearing_held", "decision", "fine_imposed", "lien_filed"].includes(
        e.event_type,
      ) && !e.evidence_title,
  );

  if (eventsWithoutEvidence.length > 0) {
    arguments_.push({
      id: `arg_${++argIdx}`,
      title: "Missing Documentation for Key Procedural Events",
      category: "evidentiary",
      status: "strengthening",
      findings: [],
      description: `${eventsWithoutEvidence.length} critical event(s) lack supporting documentation: ${eventsWithoutEvidence
        .map((e) => `${e.event_type.replace(/_/g, " ")} on ${e.event_date}`)
        .join(", ")}. The agency's claims rest on events with no evidence of record.`,
    });
  }

  // ── Evidentiary: timeline with fewer than 3 events is inherently weak ──
  if (timeline.length > 0 && timeline.length < 3) {
    arguments_.push({
      id: `arg_${++argIdx}`,
      title: "Incomplete Procedural Record",
      category: "evidentiary",
      status: "strengthening",
      findings: [],
      description: `Only ${timeline.length} timeline event(s) recorded. A complete due-process case typically requires documented notice, hearing, and decision. The sparse record suggests the agency may not have followed required procedures.`,
    });
  }

  return arguments_;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Verify case belongs to user's org
    const caseOrgId = await resolveProjectOrg(db, id);
    if (!verifyOrgAccess(auth.user, caseOrgId)) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Fetch findings
    const findingsResult = await db
      .prepare(
        `SELECT id, rule, rule_name, severity, status, detail, evidence_id, created_at
         FROM due_process_findings
         WHERE project_id = ? AND organization_id = ?
         ORDER BY severity ASC, created_at DESC`,
      )
      .bind(id, auth.user.organization_id)
      .all();

    // Fetch timeline events
    const timelineResult = await db
      .prepare(
        `SELECT id, event_date, event_type, description, evidence_title
         FROM timeline_events
         WHERE project_id = ? AND organization_id = ?
         ORDER BY event_date DESC`,
      )
      .bind(id, auth.user.organization_id)
      .all();

    const findings = (findingsResult.results ?? []) as unknown as Finding[];
    const timeline = (timelineResult.results ?? []) as unknown as TimelineEvent[];

    // Generate defense arguments
    const arguments_ = buildDefenseArguments(findings, timeline);

    // Emit audit event
    await emitAuditEvent({
      db,
      actor: humanActor(auth.user),
      action: "defense_arguments_generated",
      resourceType: "case",
      resourceId: id,
      detail: `Generated ${arguments_.length} defense arguments from ${findings.length} findings`,
    });

    return NextResponse.json(
      { arguments: arguments_ },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    return NextResponse.json(
      { error: "Failed to generate defense arguments" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
