/**
 * GET /api/v1/evidence/download?id=...
 *
 * Security:
 *   1. Authenticate user
 *   2. Load evidence record
 *   3. Verify organization access
 *   4. Verify permission (evidence.read)
 *   5. Stream file from R2 (never expose permanent URLs)
 *   6. Emit audit event for download
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";
import { humanActor, emitAuditEvent } from "@/lib/security/events";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const evidenceId = req.nextUrl.searchParams.get("id");
    if (!evidenceId) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Load evidence record — org-scoped
    const record = await db
      .prepare(
        `SELECT r2_key, title, content_type, original_filename, organization_id, withdrawn
         FROM evidence WHERE id = ? AND organization_id = ?`,
      )
      .bind(evidenceId, user.organization_id)
      .first();

    if (!record) {
      return NextResponse.json(
        { error: "Not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Authorization check
    const authz = requireAuthz(user, "evidence.read", {
      organization_id: record.organization_id as string,
    });
    if (!authz.ok) return authz.response;

    if (record.withdrawn === 1) {
      return NextResponse.json(
        { error: "Evidence has been withdrawn" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!record.r2_key) {
      return NextResponse.json(
        { error: "No file attached" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (!env.EVIDENCE_BUCKET) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500, headers: { "Cache-Control": "no-store" } },
      );
    }

    const object = await env.EVIDENCE_BUCKET.get(record.r2_key as string);
    if (!object) {
      return NextResponse.json(
        { error: "File not found in storage" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    // Emit audit event for download
    const actor = humanActor(user);
    await emitAuditEvent({
      db,
      actor,
      action: "evidence.download",
      resourceType: "evidence",
      resourceId: evidenceId,
      detail: `Downloaded '${record.title}'`,
    });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set(
      "Content-Disposition",
      `attachment; filename="${record.original_filename ?? record.title}"`,
    );
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(object.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
