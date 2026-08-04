import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

interface ResolveBody {
  apn: string;
  address?: string;
  city?: string;
  zoning?: string;
  acres?: number;
  legal?: string;
  lng?: number;
  lat?: number;
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ResolveBody;
  if (!body.apn) {
    return NextResponse.json({ error: "apn is required" }, { status: 400 });
  }

  const { env } = getCloudflareContext();
  const db = env.DB;

  const existing = await db
    .prepare("SELECT * FROM properties WHERE apn = ?")
    .bind(body.apn)
    .first();

  if (existing) {
    return NextResponse.json(existing);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO properties (id, apn, address, city, zoning, acres, legal_desc, centroid_lng, centroid_lat)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      body.apn,
      body.address ?? null,
      body.city ?? null,
      body.zoning ?? null,
      body.acres ?? null,
      body.legal ?? null,
      body.lng ?? null,
      body.lat ?? null
    )
    .run();

  const created = await db.prepare("SELECT * FROM properties WHERE id = ?").bind(id).first();
  return NextResponse.json(created, { status: 201 });
}
