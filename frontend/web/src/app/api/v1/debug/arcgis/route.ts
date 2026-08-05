/**
 * GET /api/v1/debug/arcgis
 * Debug endpoint to test ArcGIS connectivity from the worker
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const apn = request.nextUrl.searchParams.get("apn") || "002-231-009-000";
  const PARCELS_URL = "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0";
  
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = cleanAPN.length === 12 
    ? `${cleanAPN.slice(0,3)}-${cleanAPN.slice(3,6)}-${cleanAPN.slice(6,9)}-${cleanAPN.slice(9,12)}`
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
    
    return NextResponse.json({
      ok: resp.ok,
      status: resp.status,
      elapsedMs: elapsed,
      url: fullUrl,
      where,
      dashedAPN,
      cleanAPN,
      bodyPreview: text.substring(0, 500),
      bodyIsJson: (() => { try { JSON.parse(text); return true; } catch { return false; } })(),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Unknown error",
      url: fullUrl,
      where,
    }, { status: 500 });
  }
}
