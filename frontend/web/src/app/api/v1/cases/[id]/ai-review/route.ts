import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { synthesizeCaseReview, type ClaudeBindingEnv } from "@/lib/claude";

export const runtime = "nodejs";

/**
 * POST /api/v1/cases/:id/ai-review
 *
 * Runs Claude only after the case is resolved inside the authenticated org.
 * Deterministic records remain the source of truth; the response is a
 * review proposal and is not persisted as a legal conclusion.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: caseId } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const authz = authorize(auth.user, "analysis.run");
    if (!authz.allowed) {
      return NextResponse.json({ error: { code: "FORBIDDEN", message: authz.reason ?? "Forbidden" } }, { status: 403 });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const caseRecord = await db.prepare(
      `SELECT id, name, case_number, case_type, status, priority, description,
              assigned_to, due_date, opened_at, closed_at, updated_at
         FROM cases
        WHERE id = ? AND organization_id = ?
        LIMIT 1`,
    ).bind(caseId, auth.user.organization_id).first<Record<string, unknown>>();

    if (!caseRecord) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Case not found" } }, { status: 404 });
    }

    const [evidenceResult, timelineResult, findingsResult] = await Promise.all([
      db.prepare(
        `SELECT e.id, e.title, e.source, e.doc_type, e.status,
                e.extracted_text, e.ai_summary, e.created_at
           FROM evidence e JOIN case_projects cp ON cp.project_id = e.project_id
          WHERE cp.case_id = ? AND e.organization_id = ?
          ORDER BY e.created_at ASC LIMIT 100`,
      ).bind(caseId, auth.user.organization_id).all(),
      db.prepare(
        `SELECT t.id, t.event_date, t.event_type, t.description, t.evidence_id, t.created_at
           FROM timeline_events t JOIN case_projects cp ON cp.project_id = t.project_id
          WHERE cp.case_id = ? AND t.organization_id = ?
          ORDER BY COALESCE(t.event_date, t.created_at) ASC LIMIT 300`,
      ).bind(caseId, auth.user.organization_id).all(),
      db.prepare(
        `SELECT f.id, f.rule, f.rule_name, f.severity, f.status, f.detail,
                f.evidence_id, f.missing_info, f.created_at
           FROM due_process_findings f JOIN case_projects cp ON cp.project_id = f.project_id
          WHERE cp.case_id = ? AND f.organization_id = ?
          ORDER BY f.created_at ASC LIMIT 200`,
      ).bind(caseId, auth.user.organization_id).all(),
    ]);

    const evidence = (evidenceResult.results ?? []).map((row: any) => ({
      ...row,
      extracted_text: typeof row.extracted_text === "string" ? row.extracted_text.slice(0, 12000) : null,
      ai_summary: typeof row.ai_summary === "string" ? row.ai_summary.slice(0, 4000) : null,
    }));

    const review = await synthesizeCaseReview(env as unknown as ClaudeBindingEnv, {
      caseRecord,
      evidence,
      timeline: timelineResult.results ?? [],
      findings: findingsResult.results ?? [],
    });

    return NextResponse.json({
      ok: true,
      case_id: caseId,
      review,
      trust_boundary: "Claude synthesis is a review proposal. Source records and deterministic findings remain authoritative.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Claude case review failed";
    const status = message.includes("ANTHROPIC_API_KEY") ? 503 : 500;
    return NextResponse.json({ error: { code: "AI_REVIEW_FAILED", message } }, { status });
  }
}
