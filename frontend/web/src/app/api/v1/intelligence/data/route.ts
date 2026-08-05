/**
 * GET /api/v1/intelligence/data
 *
 * Returns cached property intelligence from the most recent recon run.
 * Authentication required — property intelligence is shared county data.
 */
import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAuth } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Property intelligence is shared county data — no org filter
    const intel = await db
      .prepare(
        `SELECT * FROM property_intelligence
         WHERE property_id = ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
      )
      .bind(propertyId)
      .first();

    if (!intel) {
      return NextResponse.json(
        { error: "No intelligence data found. Run recon first." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    let rawData: Record<string, any> = {};
    try {
      rawData = intel.raw_data ? JSON.parse(intel.raw_data as string) : {};
    } catch {}

    return NextResponse.json(
      { ...intel, raw_data: rawData },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
