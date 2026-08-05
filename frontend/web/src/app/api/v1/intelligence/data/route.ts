/**
 * GET /api/v1/intelligence/data
 * 
 * Returns the cached property intelligence data from the most recent recon run.
 * This includes all 12 agent results: parcel, zoning, coastal zone, flood, fire,
 * tsunami, seismic, sea level rise, airport, jurisdiction, natural resources, ADU.
 * 
 * Query params:
 *   propertyId - The property to fetch intelligence for
 */

import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json(
        { error: "propertyId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Get the latest intelligence cache entry
    const intel = await db
      .prepare(
        `SELECT * FROM property_intelligence
         WHERE property_id = ?
         ORDER BY fetched_at DESC
         LIMIT 1`
      )
      .bind(propertyId)
      .first();

    if (!intel) {
      return NextResponse.json(
        { error: "No intelligence data found. Run recon first." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Parse the raw_data JSON (all agent results)
    let rawData: Record<string, any> = {};
    try {
      rawData = intel.raw_data ? JSON.parse(intel.raw_data as string) : {};
    } catch {
      // If JSON parse fails, rawData stays empty
    }

    return NextResponse.json(
      {
        ...intel,
        raw_data: rawData, // Parsed JSON instead of string
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
