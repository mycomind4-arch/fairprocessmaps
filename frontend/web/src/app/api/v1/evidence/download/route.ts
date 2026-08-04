import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const evidenceId = req.nextUrl.searchParams.get("id");
    if (!evidenceId) {
      return NextResponse.json({ error: "id is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    const record = await db
      .prepare("SELECT r2_key, title FROM evidence WHERE id = ?")
      .bind(evidenceId)
      .first();

    if (!record) {
      return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (!record.r2_key) {
      return NextResponse.json({ error: "No file attached" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    if (!env.EVIDENCE_BUCKET) {
      return NextResponse.json({ error: "Storage not configured" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }

    const object = await env.EVIDENCE_BUCKET.get(record.r2_key as string);
    if (!object) {
      return NextResponse.json({ error: "File not found in storage" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Disposition", `attachment; filename="${record.title}"`);
    headers.set("Cache-Control", "private, max-age=3600");

    return new NextResponse(object.body, { status: 200, headers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
