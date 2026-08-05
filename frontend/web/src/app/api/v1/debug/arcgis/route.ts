/**
 * GET /api/v1/debug/arcgis
 *
 * Debug endpoint to test ArcGIS connectivity.
 * Requires admin role — no internal GIS query logic should be public.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth, requireAuthz } from "@/lib/security/middleware";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.ok) return auth.response;
  const user = auth.user;

  // Only admins can access debug routes
  const authz = requireAuthz(user, "admin.debug");
  if (!authz.ok) return authz.response;

  const apn = request.nextUrl.searchParams.get("apn") || "002-231-009-000";
  const PARCELS_URL = "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0";

  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = cleanAPN.length === 12
    ? `${cleanAPN.slice(0, 3)}-${cleanAPN.slice(3, 6)}-${cleanAPN.slice(6, 9)}-${cleanAPN.slice(9, 12)}`
    : apn;

  const where = `APN_12='${dashedAPN}' OR APN_12='${cleanAPN}' OR APN='${cleanAPN}' OR APN='${dashedAPN}'`;

  const params = new URLSearchParams({
    where,
    outFields: "APN_12,APN,FULLADDR,ACRES,ZONING",
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "1",
  });

  const fullUrl = `${PARCELS_URL}/query?${params}`;

  try {
    const t0 = Date.now();
    const resp = await fetch(fullUrl);
    const elapsed = Date.now() - t0;

    const text = await resp.text();

    return NextResponse.json(
      {
        ok: resp.ok,
        status: resp.status,
        elapsedMs: elapsed,
        url: fullUrl,
        where,
        body: text.slice(0, 2000),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), url: fullUrl },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
