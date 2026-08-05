import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;

    const q = req.nextUrl.searchParams.get("q");
    if (!q || q.trim().length < 2) {
      return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Properties are shared county-wide data — no org filter on property search
    const query = q.trim();
    const likeQuery = `%${query}%`;

    const properties = await db
      .prepare(
        `SELECT id, apn, address, city, zoning, acres, created_at
         FROM properties
         WHERE apn LIKE ? OR address LIKE ? OR city LIKE ?
         ORDER BY
           CASE WHEN apn LIKE ? THEN 0 ELSE 1 END,
           created_at DESC
         LIMIT 10`,
      )
      .bind(likeQuery, likeQuery, likeQuery, `${query}%`)
      .all();

    const items = (properties.results ?? []).map((p: any) => ({
      id: p.id,
      type: "property" as const,
      title: p.address || `APN ${p.apn}`,
      snippet: [p.city, p.zoning, p.acres ? `${parseFloat(p.acres).toFixed(1)} acres` : null]
        .filter(Boolean)
        .join(" · "),
      apn: p.apn,
    }));

    return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
