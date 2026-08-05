/**
 * GET /api/v1/evidence?projectId=... — list evidence (org-scoped)
 *
 * Evidence is immutable. DELETE has been replaced by:
 *   POST /api/v1/evidence/withdraw?id=...&projectId=...
 * which marks evidence as withdrawn with provenance (never destroys it).
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth, requireAuthz, resolveProjectOrg } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Org-scoped query
    const result = await db
      .prepare(
        `SELECT id, title, source, doc_type, status, extracted_text, ai_summary,
                r2_key, content_type, sha256_hash, uploaded_by, uploaded_at,
                withdrawn, withdrawn_at, created_at
         FROM evidence
         WHERE project_id = ? AND organization_id = ?
         ORDER BY created_at DESC`,
      )
      .bind(projectId, user.organization_id)
      .all();

    const items = (result.results ?? []).map((item: any) => ({
      ...item,
      has_file: !!item.r2_key,
    }));

    return NextResponse.json(
      { items },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

// DELETE is intentionally removed.
// Evidence is immutable — use POST /api/v1/evidence/withdraw instead.
export async function DELETE() {
  return NextResponse.json(
    {
      error:
        "Evidence cannot be deleted — it is immutable. Use POST /api/v1/evidence/withdraw to withdraw evidence with provenance.",
    },
    { status: 405, headers: { "Cache-Control": "no-store" } },
  );
}
