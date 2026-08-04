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
        `SELECT id, title, source, doc_type, status, extracted_text, ai_summary, r2_key, created_at
         FROM evidence WHERE project_id = ?
         ORDER BY created_at DESC`
      )
      .bind(projectId)
      .all();

    // For items with r2_key, generate a download URL
    const items = await Promise.all(
      (result.results ?? []).map(async (item: any) => {
        if (item.r2_key && env.EVIDENCE_BUCKET) {
          try {
            // Create a presigned URL via R2's HTTP API
            // Cloudflare R2 doesn't support presigned URLs directly in Workers,
            // but we can return the key and have a download endpoint
            return { ...item, has_file: true };
          } catch {
            return { ...item, has_file: !!item.r2_key };
          }
        }
        return { ...item, has_file: false };
      })
    );

    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

// DELETE evidence record
export async function DELETE(req: NextRequest) {
  try {
    const evidenceId = req.nextUrl.searchParams.get("id");
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!evidenceId || !projectId) {
      return NextResponse.json({ error: "id and projectId are required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Get the record to find r2_key
    const record = await db
      .prepare("SELECT r2_key FROM evidence WHERE id = ? AND project_id = ?")
      .bind(evidenceId, projectId)
      .first();

    // Delete from R2 if exists
    if (record?.r2_key && env.EVIDENCE_BUCKET) {
      try {
        await env.EVIDENCE_BUCKET.delete(record.r2_key as string);
      } catch {}
    }

    // Delete timeline events referencing this evidence
    await db.prepare("DELETE FROM timeline_events WHERE evidence_id = ?").bind(evidenceId).run();

    // Delete the evidence record
    await db.prepare("DELETE FROM evidence WHERE id = ? AND project_id = ?").bind(evidenceId, projectId).run();

    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
