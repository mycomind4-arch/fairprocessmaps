import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { runAnalysis } from "@/lib/auto-triggers";
import { emitEvent } from "@/lib/event-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const files = formData.getAll("files") as File[];
    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;

    const uploaded: Array<{ id: string; title: string; r2Key: string }> = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const r2Key = `evidence/${projectId}/${id}/${file.name}`;

      if (bucket) {
        await bucket.put(r2Key, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
        });
      }

      // Try to extract basic text from text-based files
      let extractedText: string | null = null;
      const mime = file.type;
      if (mime.startsWith("text/") || mime === "application/json" || mime === "application/xml") {
        const text = await file.text();
        extractedText = text.slice(0, 50000); // cap at 50k chars
      }

      await db
        .prepare(
          `INSERT INTO evidence (id, project_id, source, doc_type, title, status, extracted_text)
           VALUES (?, ?, 'upload', ?, ?, 'processed', ?)`
        )
        .bind(id, projectId, mime || "document", file.name, extractedText)
        .run();

      // Create a timeline event for the upload
      await db
        .prepare(
          `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description)
           VALUES (?, ?, ?, datetime('now'), 'evidence_uploaded', ?)`
        )
        .bind(crypto.randomUUID(), projectId, id, `Evidence uploaded: ${file.name}`)
        .run();

      // ── Emit event to the Event Store ──
      await emitEvent(db, {
        case_id: projectId,
        event_type: "evidence.uploaded",
        entity_type: "evidence",
        entity_id: id,
        actor_type: "user",
        title: `Evidence uploaded: ${file.name}`,
        payload: { file_name: file.name, mime_type: mime, r2_key: r2Key },
      });

      uploaded.push({ id, title: file.name, r2Key });
    }

    // Auto-trigger analysis after evidence upload
    try {
      const analysisResult = await runAnalysis(projectId);
      return NextResponse.json(
        { uploaded: uploaded.length, ids: uploaded.map(u => u.id), analysis: analysisResult },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      // Analysis failed but upload succeeded
      return NextResponse.json(
        { uploaded: uploaded.length, ids: uploaded.map(u => u.id) },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// GET endpoint to download evidence files from R2
export async function GET(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    const evidenceId = req.nextUrl.searchParams.get("id");

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    if (evidenceId) {
      // Return specific evidence record with download URL
      const record = await db
        .prepare("SELECT * FROM evidence WHERE id = ? AND project_id = ?")
        .bind(evidenceId, projectId)
        .first();

      if (!record) {
        return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
      }

      return NextResponse.json(record, { headers: { "Cache-Control": "no-store" } });
    }

    // List all evidence for the project
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
