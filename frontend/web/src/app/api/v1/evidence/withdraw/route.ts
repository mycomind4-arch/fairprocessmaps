/**
 * POST /api/v1/evidence/withdraw?id=...&projectId=...
 *
 * Evidence is immutable — it cannot be deleted.
 * Withdrawal marks the evidence as withdrawn and emits a provenance event.
 * The R2 object is retained for chain-of-custody.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";
import { humanActor, emitTimelineEvent, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  const evidenceId = req.nextUrl.searchParams.get("id");
  const projectId = req.nextUrl.searchParams.get("projectId");

  if (!evidenceId || !projectId) {
    return NextResponse.json(
      { error: "id and projectId are required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Authorization: check org boundary on the project
  const { env } = getCloudflareContext();
  const db = env.DB;

  const projectOrg = await resolveProjectOrg(db, projectId);
  const authz = requireAuthz(user, "evidence.withdraw", {
    organization_id: projectOrg ?? undefined,
    project_id: projectId,
  });
  if (!authz.ok) return authz.response;

  // Load evidence record — org-scoped
  const record = await db
    .prepare(
      `SELECT id, organization_id, withdrawn, title
       FROM evidence
       WHERE id = ? AND project_id = ? AND organization_id = ?`,
    )
    .bind(evidenceId, projectId, user.organization_id)
    .first();

  if (!record) {
    return NextResponse.json(
      { error: "Evidence not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (record.withdrawn === 1) {
    return NextResponse.json(
      { error: "Evidence already withdrawn" },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Mark as withdrawn (NOT deleted)
  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE evidence
       SET withdrawn = 1, withdrawn_at = ?, withdrawn_by = ?, status = 'withdrawn'
       WHERE id = ? AND project_id = ? AND organization_id = ?`,
    )
    .bind(now, user.id, evidenceId, projectId, user.organization_id)
    .run();

  // Emit timeline event with actor provenance
  const actor = humanActor(user);
  await emitTimelineEvent({
    db,
    projectId,
    evidenceId,
    eventDate: now.slice(0, 10),
    eventType: "evidence_withdrawn",
    description: `Evidence withdrawn: ${record.title}`,
    actor,
  });

  // Emit audit event
  await emitAuditEvent({
    db,
    actor,
    action: "evidence.withdraw",
    resourceType: "evidence",
    resourceId: evidenceId,
    detail: `Evidence '${record.title}' withdrawn by ${user.name}`,
  });

  return NextResponse.json(
    { withdrawn: true, evidenceId },
    { headers: { "Cache-Control": "no-store" } },
  );
}
