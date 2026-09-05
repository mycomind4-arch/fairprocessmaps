import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { hashContent } from "@/lib/workflows/engine";

export const runtime = "nodejs";

/**
 * POST /api/v1/workflows/[runId]/authorize
 *
 * Records a human authorizing an irreversible workflow stage — today, mailing a
 * response to an agency.
 *
 * Three things make this more than a checkbox:
 *
 *   1. The caller must send the exact document text they are approving. We hash
 *      it server-side rather than trusting a client-supplied hash, so the
 *      authorization is bound to content we have actually seen.
 *   2. An explicit typed attestation is required. Clicking "OK" is not a record
 *      of anyone having read anything; a sentence someone typed is.
 *   3. Prior authorizations for the stage are superseded, not overwritten. The
 *      history of who approved what stays intact.
 *
 * This endpoint does NOT send anything. It only records permission. Sending is a
 * separate call, which is what makes "authorized but not yet sent" a real and
 * inspectable state.
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

    // Authorizing outbound correspondence is a communication action, not a
    // read. Roles that can only view a case must not be able to send from it.
    const authz = authorize(user, "communication.create");
    if (!authz.allowed) {
      return NextResponse.json(
        {
          error:
            "Authorizing outbound mail requires permission to create communications on this case.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const body = (await req.json()) as {
      stageId?: string;
      documentText?: string;
      attestation?: string;
    };

    const stageId = body.stageId ?? "mail";

    if (!body.documentText?.trim()) {
      return NextResponse.json(
        { error: "documentText is required — authorization binds to exact content." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Require a real sentence, not a click-through. Short strings like "ok"
    // are not evidence that a person read a legal document.
    if (!body.attestation || body.attestation.trim().length < 20) {
      return NextResponse.json(
        {
          error:
            "An attestation of at least 20 characters is required. State in your own words that you have read the final document and authorize sending it.",
        },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const run = await db
      .prepare(
        `SELECT id, case_id, status FROM workflow_runs WHERE id = ? AND organization_id = ?`,
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
        { error: `This run is ${run.status}; it cannot be authorized.` },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Hash server-side. A client-supplied hash would let a caller authorize
    // one document and send another.
    const contentHash = await hashContent(body.documentText);
    const id = crypto.randomUUID();

    await db.batch([
      db
        .prepare(
          `UPDATE workflow_authorizations
              SET superseded_at = datetime('now')
            WHERE run_id = ? AND stage_id = ? AND superseded_at IS NULL`,
        )
        .bind(runId, stageId),
      db
        .prepare(
          `INSERT INTO workflow_authorizations
             (id, run_id, organization_id, stage_id, authorized_by, content_hash, attestation)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, runId, orgId, stageId, user.email ?? user.id, contentHash, body.attestation.trim()),
    ]);

    await emitAuditEvent({
      db,
      actor: humanActor(user),
      action: "workflow.stage.authorized",
      resourceType: "workflow_run",
      resourceId: runId,
      detail: JSON.stringify({
        stageId,
        contentHash,
        attestation: body.attestation.trim(),
        caseId: run.case_id,
      }),
    });

    return NextResponse.json(
      {
        id,
        runId,
        stageId,
        contentHash,
        authorizedBy: user.email ?? user.id,
        // Said explicitly so no caller assumes this sent the letter.
        sent: false,
        nextStep:
          "Nothing has been mailed yet. Advance the run to send, and note that editing the document after this point invalidates this authorization.",
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
