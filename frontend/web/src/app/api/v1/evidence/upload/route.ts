import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

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
    const bucket = env.R2_BUCKET;

    const uploaded: string[] = [];

    for (const file of files) {
      const id = crypto.randomUUID();
      const r2Key = `evidence/${projectId}/${id}/${file.name}`;

      if (bucket) {
        await bucket.put(r2Key, file.stream(), {
          httpMetadata: { contentType: file.type || "application/octet-stream" },
        });
      }

      await db
        .prepare(
          `INSERT INTO evidence (id, project_id, source, title, r2_key, status)
           VALUES (?, ?, 'upload', ?, ?, 'pending')`
        )
        .bind(id, projectId, file.name, r2Key)
        .run();

      uploaded.push(id);
    }

    return NextResponse.json({ uploaded: uploaded.length, ids: uploaded }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
