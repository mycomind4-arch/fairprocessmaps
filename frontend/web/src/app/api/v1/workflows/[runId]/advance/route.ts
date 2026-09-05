import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { advanceRun, hashContent, type EngineDeps } from "@/lib/workflows/engine";
import type { StageAuthorization, StageId, StageResult } from "@/lib/workflows/types";
import {
  classifyStage,
  deadlineStage,
  extractStage,
  draftStage,
  authorizeStage,
} from "@/lib/workflows/stages";
import { runAnalysis } from "@/lib/auto-triggers";
import { resolvePack, defaultPack } from "@/lib/policy/registry";
import { LobProvider, isLobConfigured, isLobTestMode } from "@/lib/mail/lob";

export const runtime = "nodejs";

/**
 * POST /api/v1/workflows/[runId]/advance
 *
 * Runs the workflow as far as it can go, stopping at the first stage that needs
 * a human. Safe to call repeatedly: completed stages are not re-run, and the
 * mail stage refuses without a valid authorization regardless of how many times
 * this is called.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
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

    const limit = await checkRateLimit(req, "workflow_advance", 20, 60);
    if (!limit.ok) return limit.response!;

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const run = await db
      .prepare(
        `SELECT id, case_id, status, source_evidence_id
           FROM workflow_runs WHERE id = ? AND organization_id = ?`,
      )
      .bind(runId, orgId)
      .first();

    if (!run) {
      return NextResponse.json(
        { error: "Workflow run not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (run.status === "cancelled" || run.status === "complete") {
      return NextResponse.json(
        { error: `This run is ${run.status}.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    const caseId = run.case_id as string;

    // Prior results, so completed stages are not re-run.
    const priorRows = await db
      .prepare(
        `SELECT stage_id, status, summary, output, blocked_reason, next_action,
                started_at, completed_at
           FROM workflow_stage_results
          WHERE run_id = ? AND organization_id = ?
          ORDER BY started_at ASC`,
      )
      .bind(runId, orgId)
      .all();

    const priorResults: StageResult[] = ((priorRows.results ?? []) as Record<string, unknown>[])
      .map((r) => ({
        stageId: r.stage_id as StageId,
        status: r.status as StageResult["status"],
        summary: (r.summary as string) ?? "",
        output: r.output ? JSON.parse(r.output as string) : undefined,
        blockedReason: (r.blocked_reason as string) ?? undefined,
        nextAction: (r.next_action as string) ?? undefined,
        startedAt: r.started_at as string,
        completedAt: (r.completed_at as string) ?? undefined,
      }))
      // Only completed stages count as done; a blocked stage retries.
      .filter((r) => r.status === "complete");

    // Notice text and case context.
    const evidence = await db
      .prepare(
        `SELECT id, extracted_text, ai_summary FROM evidence
          WHERE id = ? AND organization_id = ?`,
      )
      .bind(run.source_evidence_id as string, orgId)
      .first();

    const noticeText = [evidence?.extracted_text, evidence?.ai_summary]
      .filter(Boolean)
      .join("\n\n");

    const project = await db
      .prepare(
        `SELECT p.case_type, pr.county FROM projects p
           LEFT JOIN properties pr ON p.property_id = pr.id
          WHERE p.id = ? AND p.organization_id = ?`,
      )
      .bind(caseId, orgId)
      .first();

    const pack =
      resolvePack(project?.county as string | null, project?.case_type as string | null) ??
      defaultPack();

    // ── Engine wiring ──

    const deps: EngineDeps = {
      async loadAuthorization(rid, stageId): Promise<StageAuthorization | null> {
        const row = await db
          .prepare(
            `SELECT run_id, stage_id, authorized_by, authorized_at, content_hash, attestation
               FROM workflow_authorizations
              WHERE run_id = ? AND stage_id = ? AND organization_id = ?
                AND superseded_at IS NULL
              ORDER BY authorized_at DESC LIMIT 1`,
          )
          .bind(rid, stageId, orgId)
          .first();
        if (!row) return null;
        return {
          runId: row.run_id as string,
          stageId: row.stage_id as StageId,
          authorizedBy: row.authorized_by as string,
          authorizedAt: row.authorized_at as string,
          contentHash: row.content_hash as string,
          attestation: row.attestation as string,
        };
      },

      async currentContentHash(rid, _stageId) {
        // The content that would be mailed is the current draft body.
        const row = await db
          .prepare(
            `SELECT output FROM workflow_stage_results
              WHERE run_id = ? AND stage_id = 'draft' AND status = 'complete'
                AND organization_id = ?
              ORDER BY started_at DESC LIMIT 1`,
          )
          .bind(rid, orgId)
          .first();
        if (!row?.output) return null;
        const parsed = JSON.parse(row.output as string) as { body?: string };
        return parsed.body ? await hashContent(parsed.body) : null;
      },

      executors: {
        intake: async () => ({
          stageId: "intake",
          status: "complete",
          summary: `Notice registered from evidence ${run.source_evidence_id}.`,
          output: { evidenceId: run.source_evidence_id, hasText: noticeText.length > 0 },
          startedAt: new Date().toISOString(),
        }),

        classify: classifyStage(env as never, noticeText),
        extract: extractStage(env as never, noticeText),
        deadline: deadlineStage(pack),

        analyze: async () => {
          const result = await runAnalysis(caseId);
          return {
            stageId: "analyze",
            status: "complete",
            summary: result.summary,
            output: {
              score: result.score,
              findingsCount: result.findingsCount,
              provisional: result.provisional,
              policyVersion: result.policyVersion,
            },
            startedAt: new Date().toISOString(),
          };
        },

        draft: draftStage(env as never),
        authorize: authorizeStage(),

        // The mail executor is only ever reached after the engine's gate has
        // already verified a matching authorization exists.
        mail: async (ctx) => {
          if (!isLobConfigured(env as never)) {
            return {
              stageId: "mail",
              status: "blocked",
              summary: "No mail provider is configured.",
              blockedReason: "LOB_API_KEY is not set.",
              nextAction:
                "Configure a Lob API key. Use a test_ key first — it exercises the whole path without mailing anything.",
              startedAt: new Date().toISOString(),
            };
          }
          // Deliberately not implemented end-to-end here: sending requires a
          // rendered PDF, a verified recipient address, and a persisted
          // workflow_mailings row. Returning blocked is the honest state —
          // better than a stage that appears to succeed without mailing.
          const provider = new LobProvider(env as never);
          return {
            stageId: "mail",
            status: "blocked",
            summary: `Authorized and ready to send via ${provider.id}${
              isLobTestMode(env as never) ? " (test mode)" : ""
            }, but PDF rendering and recipient verification are not yet wired into this stage.`,
            blockedReason: "Send path incomplete.",
            nextAction:
              "Wire response-pdf rendering and address verification into the mail stage, then re-advance.",
            startedAt: new Date().toISOString(),
          };
        },
      },
    };

    const { results, haltedAt, status } = await advanceRun(deps, {
      runId,
      caseId,
      organizationId: orgId,
      actor: user.email ?? user.id,
      priorResults,
    });

    // Persist the stages that ran this call.
    const fresh = results.slice(priorResults.length);
    if (fresh.length > 0) {
      await db.batch(
        fresh.map((r) =>
          db
            .prepare(
              `INSERT INTO workflow_stage_results
                 (id, run_id, organization_id, stage_id, status, summary, output,
                  blocked_reason, next_action, started_at, completed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .bind(
              crypto.randomUUID(),
              runId,
              orgId,
              r.stageId,
              r.status,
              r.summary,
              r.output ? JSON.stringify(r.output) : null,
              r.blockedReason ?? null,
              r.nextAction ?? null,
              r.startedAt,
              r.completedAt ?? null,
            ),
        ),
      );
    }

    // Denormalize the deadline so it can be listed without replaying the run.
    const deadlineResult = results.find((r) => r.stageId === "deadline" && r.status === "complete");
    const primary = (deadlineResult?.output as { primary?: Record<string, unknown> } | undefined)
      ?.primary;

    await db
      .prepare(
        `UPDATE workflow_runs
            SET status = ?, current_stage = ?, updated_at = datetime('now'),
                response_due_date = COALESCE(?, response_due_date),
                deadline_confidence = COALESCE(?, deadline_confidence)
          WHERE id = ? AND organization_id = ?`,
      )
      .bind(
        status,
        haltedAt,
        (primary?.dueDate as string) ?? null,
        (primary?.confidence as string) ?? null,
        runId,
        orgId,
      )
      .run();

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "workflow.run.advanced",
      resourceType: "workflow_run",
      resourceId: runId,
      detail: JSON.stringify({
        status,
        haltedAt,
        stagesRun: fresh.map((r) => `${r.stageId}:${r.status}`),
      }),
    });

    return NextResponse.json(
      { runId, status, haltedAt, results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
