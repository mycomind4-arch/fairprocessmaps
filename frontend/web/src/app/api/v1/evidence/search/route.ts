/**
 * GET /api/v1/evidence/search?projectId=&q=
 *
 * Full-text search over evidence content — the other half of "AI summaries &
 * full-text search" that was never built. Before this, the "Search evidence…"
 * box in EvidenceVaultPanel only matched a document's title client-side;
 * extracted_text and ai_summary (now populated for photographed/scanned
 * documents too — see /api/v1/evidence/upload) were never searchable, so a
 * document could hold the exact fact someone needed and be unfindable unless
 * they already knew which file it was in.
 *
 * LIKE-based, not FTS5: evidence volume per case is modest, and this matches
 * the same tradeoff already made for the audit log search
 * (/api/v1/admin/audit-logs) rather than adding a virtual-table migration for
 * a search surface this size.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { snippetAround, matchedIn } from "@/lib/evidence-search";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const projectId = req.nextUrl.searchParams.get("projectId");
    const q = req.nextUrl.searchParams.get("q")?.trim();
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!q) {
      return NextResponse.json(
        { items: [] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const like = `%${q}%`;

    const result = await db
      .prepare(
        `SELECT id, title, doc_type, status, extracted_text, ai_summary, content_type, uploaded_at
         FROM evidence
         WHERE project_id = ? AND organization_id = ? AND withdrawn != 1
           AND (title LIKE ? OR extracted_text LIKE ? OR ai_summary LIKE ?)
         ORDER BY uploaded_at DESC
         LIMIT 50`,
      )
      .bind(projectId, user.organization_id, like, like, like)
      .all();

    const items = ((result.results ?? []) as Record<string, unknown>[]).map((r) => {
      const location = matchedIn(q, {
        title: r.title as string | null,
        aiSummary: r.ai_summary as string | null,
        extractedText: r.extracted_text as string | null,
      });
      return {
        id: r.id,
        title: r.title,
        doc_type: r.doc_type,
        status: r.status,
        content_type: r.content_type,
        uploaded_at: r.uploaded_at,
        matched_in: location,
        snippet:
          location === "ai_summary"
            ? snippetAround(r.ai_summary as string, q)
            : location === "extracted_text"
              ? snippetAround(r.extracted_text as string, q)
              : null,
      };
    });

    return NextResponse.json(
      { items, query: q },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
