import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const { id } = await params;
    const { env } = getCloudflareContext();

    const rows = await env.DB.prepare(`
      SELECT e.id, e.title, e.source, e.doc_type, e.status, e.created_at,
             e.original_filename, e.content_type, e.r2_key, e.withdrawn
        FROM evidence e
        JOIN case_projects cp ON cp.project_id = e.project_id
       WHERE cp.case_id = ?
         AND cp.organization_id = ?
       ORDER BY e.created_at DESC
    `).bind(id, auth.user.organization_id).all();

    return NextResponse.json(
      { ok: true, data: rows.results ?? [], error: null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false, data: null, error: { code: "INTERNAL", message: "Could not load case evidence" } },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
