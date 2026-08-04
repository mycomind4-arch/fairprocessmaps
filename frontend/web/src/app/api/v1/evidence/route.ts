import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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
        `SELECT id, title, source, doc_type, status, extracted_text, ai_summary, created_at
         FROM evidence WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();

    return NextResponse.json({ items: result.results ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
