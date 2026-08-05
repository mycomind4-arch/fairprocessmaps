import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysisAgents } from "@/lib/analysis-agents";
import { runAnalysis, RULES } from "@/lib/auto-triggers";
import { emitEvent, createRelationship } from "@/lib/event-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const result = await db
      .prepare(
        `SELECT id, rule, rule_name, severity, status, detail, evidence_id, created_at
         FROM due_process_findings WHERE project_id = ?
         ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC`
      )
      .bind(projectId)
      .all();

    const project = await db
      .prepare("SELECT due_process_score FROM projects WHERE id = ?")
      .bind(projectId)
      .first();

    return NextResponse.json(
      { items: result.results ?? [], score: project?.due_process_score ?? null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// POST — run full analysis agents (statute matching + discrepancy detection + timeline + facts)
export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Get property ID for the project
    const project = await db
      .prepare("SELECT property_id FROM projects WHERE id = ?")
      .bind(projectId)
      .first();

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // ── Emit analysis.started event ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "analysis.started",
      entity_type: "analysis",
      entity_id: projectId,
      actor_type: "ai_agent",
    });

    // Run the new multi-agent analysis system
    const analysisResult = await runAnalysisAgents({
      projectId,
      propertyId: project.property_id as string,
      db,
    });

    // Also run the legacy rule-based analysis (for backward compatibility)
    const legacyResult = await runAnalysis(projectId);

    // ── Emit analysis.completed event ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "analysis.completed",
      entity_type: "analysis",
      entity_id: projectId,
      actor_type: "ai_agent",
      title: `Analysis complete: ${analysisResult.totalFindings} findings (${analysisResult.criticalFindings} critical)`,
      payload: {
        score: legacyResult.score,
        total_findings: analysisResult.totalFindings,
        critical_findings: analysisResult.criticalFindings,
        warning_findings: analysisResult.warningFindings,
        agent_count: analysisResult.results.length,
      },
    });

    // ── Create relationships for findings ──
    // Each finding → supported_by → evidence (if evidence_id exists)
    // Each finding → mandated_by → statute (if rule references a statute)
    try {
      const findings = await db
        .prepare("SELECT id, rule, evidence_id FROM due_process_findings WHERE project_id = ? AND status = 'open'")
        .bind(projectId)
        .all();

      for (const finding of (findings.results || []) as any[]) {
        if (finding.evidence_id) {
          await createRelationship(db, {
            case_id: projectId,
            source_type: "finding",
            source_id: finding.id,
            target_type: "evidence",
            target_id: finding.evidence_id,
            relationship_type: "supported_by",
          });
        }
        // Map rule to statute reference where possible
        const statuteMap: Record<string, string> = {
          notice_timing: "HCC § 351-12",
          hearing_right: "HCC § 311-3",
          appeal_pathway: "CA Gov Code § 65905",
          abatement_without_notice: "HCC § 311-3",
          permit_review_right: "CA Gov Code § 65852.2",
        };
        const statuteRef = statuteMap[finding.rule];
        if (statuteRef) {
          await createRelationship(db, {
            case_id: projectId,
            source_type: "finding",
            source_id: finding.id,
            target_type: "statute",
            target_id: statuteRef,
            relationship_type: "mandated_by",
          });
        }
      }
    } catch {
      // Relationship creation is best-effort
    }

    // ── Emit finding.created events ──
    try {
      const newFindings = await db
        .prepare("SELECT id, rule, rule_name, severity, detail, evidence_id FROM due_process_findings WHERE project_id = ? AND status = 'open'")
        .bind(projectId)
        .all();

      for (const finding of (newFindings.results || []) as any[]) {
        await emitEvent(db, {
          case_id: projectId,
          event_type: "finding.created",
          entity_type: "finding",
          entity_id: finding.id,
          actor_type: "ai_agent",
          severity: finding.severity === "critical" ? "critical" : finding.severity === "warning" ? "warning" : "info",
          title: `${finding.rule_name || finding.rule}: ${finding.detail?.slice(0, 100) || "Finding generated"}`,
          payload: { rule: finding.rule, severity: finding.severity, evidence_id: finding.evidence_id },
        });
      }
    } catch {
      // Best-effort
    }

    return NextResponse.json({
      score: legacyResult.score,
      summary: analysisResult.summary,
      agentCount: analysisResult.results.length,
      results: analysisResult.results.map(r => ({
        agent: r.agent,
        status: r.status,
        message: r.message,
      })),
      totalFindings: analysisResult.totalFindings,
      criticalFindings: analysisResult.criticalFindings,
      warningFindings: analysisResult.warningFindings,
      guardrail: "You identify evidentiary status. You do not render legal conclusions.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// PATCH — update finding status (resolve/unresolve)
export async function PATCH(req: NextRequest) {
  try {
    const findingId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!findingId || !projectId) {
      return NextResponse.json({ error: "id and projectId are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const body = (await req.json()) as { status?: string };
    if (!body.status || !["open", "resolved", "dismissed"].includes(body.status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    await db
      .prepare("UPDATE due_process_findings SET status = ? WHERE id = ? AND project_id = ?")
      .bind(body.status, findingId, projectId)
      .run();

    // ── Emit finding.resolved event ──
    await emitEvent(db, {
      case_id: projectId,
      event_type: "finding.resolved",
      entity_type: "finding",
      entity_id: findingId,
      actor_type: "user",
      title: `Finding ${body.status}`,
      payload: { status: body.status },
    });

    return NextResponse.json({ updated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
