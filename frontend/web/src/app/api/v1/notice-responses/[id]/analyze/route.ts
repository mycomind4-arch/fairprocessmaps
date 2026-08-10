import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";
import { analyzeNotice } from "@/lib/notice-response";

export const runtime = "nodejs";
const MAX_AI_DOCUMENT_BYTES = 8 * 1024 * 1024;
function daysUntil(date: string | null): number | null { if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null; const today = new Date(); const utcToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()); return Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - utcToday) / 86400000); }

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth(_req); if (!auth.ok) return auth.response; const { id } = await params; const { env } = getCloudflareContext();
    const row: any = await env.DB.prepare(`SELECT * FROM notice_responses WHERE id = ? AND organization_id = ? LIMIT 1`).bind(id, auth.user.organization_id).first();
    if (!row) return NextResponse.json({ error: "Notice response not found" }, { status: 404 });
    if (!row.notice_text && !row.r2_key) return NextResponse.json({ error: "No readable notice content is available." }, { status: 422 });
    await env.DB.prepare(`UPDATE notice_responses SET analysis_status = 'running', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(new Date().toISOString(), id, auth.user.organization_id).run();
    try {
      let document: { mediaType: string; data: ArrayBuffer } | undefined;
      if (!row.notice_text && row.r2_key && env.EVIDENCE_BUCKET) {
        const object = await env.EVIDENCE_BUCKET.get(row.r2_key);
        if (!object) throw new Error("Stored notice file could not be retrieved");
        if (object.size > MAX_AI_DOCUMENT_BYTES) throw new Error("This notice is too large for direct AI inspection. Paste its text into the case or use the document extraction worker.");
        const mediaType = row.content_type || "application/pdf";
        if (mediaType === "application/pdf" || mediaType.startsWith("image/")) document = { mediaType, data: await object.arrayBuffer() };
      }
      if (!row.notice_text && !document) throw new Error("Text extraction is required before analysis for this file type.");
      const analysis = await analyzeNotice(env as unknown as Record<string, unknown>, { metadata: { notice_type: row.notice_type, agency_name: row.agency_name, notice_title: row.notice_title, reference_number: row.reference_number, received_date: row.received_date, response_deadline: row.response_deadline }, noticeText: row.notice_text || undefined, document });
      if (row.response_deadline) analysis.response_deadline = row.response_deadline; analysis.days_remaining = daysUntil(analysis.response_deadline);
      const now = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`UPDATE notice_responses SET analysis_json = ?, analysis_status = 'complete', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(JSON.stringify(analysis), now, id, auth.user.organization_id),
        env.DB.prepare(`UPDATE cases SET name = ?, case_type = 'notice_response', due_date = COALESCE(?, due_date), updated_at = ? WHERE id = ? AND organization_id = ?`).bind(analysis.notice_title || analysis.agency_name || row.notice_title || row.agency_name || "Notice response", analysis.response_deadline, now, row.case_id, auth.user.organization_id),
      ]);
      return NextResponse.json({ analysis, status: "complete" }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) { await env.DB.prepare(`UPDATE notice_responses SET analysis_status = 'failed', updated_at = ? WHERE id = ? AND organization_id = ?`).bind(new Date().toISOString(), id, auth.user.organization_id).run(); throw err; }
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
