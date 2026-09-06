import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { NOTICE_RESPONSE_WORKFLOW, WORKFLOW_REGISTRY, getWorkflow } from "@/lib/workflows/types";

export const runtime = "nodejs";

// GET /api/v1/cases/[id]/workflows — runs on this case, with stage results
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const runs = await db
      .prepare(
        `SELECT id, workflow_id, status, current_stage, notice_type, service_date,
                response_due_date, deadline_confidence, created_by, created_at, updated_at
           FROM workflow_runs
          WHERE case_id = ? AND organization_id = ?
          ORDER BY created_at DESC`,
      )
      .bind(id, orgId)
      .all();

    const runRows = (runs.results ?? []) as Record<string, unknown>[];

    // Stage results for every run in one query rather than N+1.
    const stages = runRows.length
      ? await db
          .prepare(
            `SELECT run_id, stage_id, status, summary, output, blocked_reason,
                    next_action, started_at, completed_at
               FROM workflow_stage_results
              WHERE organization_id = ?
                AND run_id IN (${runRows.map(() => "?").join(",")})
              ORDER BY started_at ASC`,
          )
          .bind(orgId, ...runRows.map((r) => r.id as string))
          .all()
      : { results: [] };

    const byRun = new Map<string, unknown[]>();
    for (const s of (stages.results ?? []) as Record<string, unknown>[]) {
      const list = byRun.get(s.run_id as string) ?? [];
      list.push({
        ...s,
        output: s.output ? JSON.parse(s.output as string) : null,
      });
      byRun.set(s.run_id as string, list);
    }

    return NextResponse.json(
      {
        definition: NOTICE_RESPONSE_WORKFLOW,
        // Every workflow available to start, for a catalog UI.
        catalog: Object.values(WORKFLOW_REGISTRY),
        runs: runRows.map((r) => ({ ...r, stages: byRun.get(r.id as string) ?? [] })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// POST /api/v1/cases/[id]/workflows — start a notice-response run
//
// Starting a run performs no outward-facing action. It registers the notice and
// lets the engine advance to the first gate.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "analysis.run");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const limit = await checkRateLimit(req, "workflow_start", 10, 60);
    if (!limit.ok) return limit.response!;

    const body = (await req.json()) as {
      workflowId?: string;
      sourceEvidenceId?: string;
      noticeType?: string;
      serviceDate?: string;
    };

    const workflow = getWorkflow(body.workflowId ?? NOTICE_RESPONSE_WORKFLOW.id);
    if (!workflow) {
      return NextResponse.json(
        { error: `Unknown workflow: ${body.workflowId}` },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Only the notice-response workflow starts from a source document; a
    // records request has nothing to read yet — it starts from a blank draft.
    if (workflow.id === NOTICE_RESPONSE_WORKFLOW.id && !body.sourceEvidenceId) {
      return NextResponse.json(
        { error: "sourceEvidenceId is required — a run must start from a notice document." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const project = await db
      .prepare(`SELECT id FROM projects WHERE id = ? AND organization_id = ?`)
      .bind(id, orgId)
      .first();
    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (body.sourceEvidenceId) {
      const evidence = await db
        .prepare(`SELECT id FROM evidence WHERE id = ? AND project_id = ? AND organization_id = ?`)
        .bind(body.sourceEvidenceId, id, orgId)
        .first();
      if (!evidence) {
        return NextResponse.json(
          { error: "Notice document not found on this case" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const runId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO workflow_runs
           (id, workflow_id, case_id, organization_id, status, current_stage,
            source_evidence_id, notice_type, service_date, created_by)
         VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        workflow.id,
        id,
        orgId,
        workflow.stages[0]?.id ?? null,
        body.sourceEvidenceId ?? null,
        body.noticeType ?? null,
        body.serviceDate ?? null,
        user.email ?? user.id,
      )
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "workflow.run.started",
      resourceType: "workflow_run",
      resourceId: runId,
      detail: JSON.stringify({ caseId: id, sourceEvidenceId: body.sourceEvidenceId }),
    });

    return NextResponse.json(
      {
        id: runId,
        caseId: id,
        status: "running",
        workflowId: workflow.id,
        stages: workflow.stages.map((s) => ({
          id: s.id,
          name: s.name,
          requiresAuthorization: s.requiresAuthorization,
          usesAI: s.usesAI,
        })),
        note: "Nothing is sent outside the organization until a person authorizes it.",
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
