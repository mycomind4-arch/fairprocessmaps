import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const { results } = await env.DB.prepare(
      "SELECT * FROM projects WHERE property_id = ? ORDER BY opened_at DESC"
    )
      .bind(propertyId)
      .all();
    return NextResponse.json(results);
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500 });
  }
}

interface CreateProjectBody {
  name: string;
  case_type: string;
  department?: string;
}

export async function POST(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "propertyId is required" }, { status: 400 });
    }

    const body = (await req.json()) as CreateProjectBody;
    if (!body.name?.trim() || !body.case_type) {
      return NextResponse.json({ error: "name and case_type are required" }, { status: 400 });
    }

    const { env } = getCloudflareContext();
    const projectId = crypto.randomUUID();

    await env.DB.prepare(
      `INSERT INTO projects (id, property_id, name, case_type, department)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(projectId, propertyId, body.name.trim(), body.case_type, body.department ?? null)
      .run();

    const created = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first();
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err), stack: (err as Error)?.stack }, { status: 500 });
  }
}
