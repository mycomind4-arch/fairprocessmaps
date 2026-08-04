import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export const runtime = "nodejs";

const HUMBOLDT_PARCEL_URL =
  "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0/query";

const PARCEL_FIELDS = [
  "APN_12", "APN", "FULLADDR", "SITCITY", "ACRES", "LOTSIZE",
  "ZONING", "GEN_PLAN", "YEAR_BUILT", "LEGAL", "SUPD_DIST",
  "CZ", "FZ", "FR", "SRA", "TRANDATE", "BKPG", "OLDAPN",
];

function uuid(): string {
  return crypto.randomUUID();
}

// ── Normalize APN to dashed format (Humboldt County stores APN_12 as XXX-XXX-XXX-XXX) ──

function toDashedAPN(apn: string): string {
  const clean = apn.replace(/[-\s]/g, "");
  // Humboldt uses XXX-XXX-XXX-XXX (12 digits)
  if (clean.length === 12) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-${clean.slice(9, 12)}`;
  }
  // 9-digit: XXX-XXX-XXX
  if (clean.length === 9) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;
  }
  return apn;
}

// ── Query Humboldt County GIS by APN ──

async function fetchParcelByAPN(apn: string): Promise<any | null> {
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = toDashedAPN(apn);
  // Try both clean and dashed formats — county stores APN_12 with dashes
  const where = `APN_12='${dashedAPN}' OR APN_12='${cleanAPN}' OR APN='${cleanAPN}' OR APN='${dashedAPN}'`;

  const params = new URLSearchParams({
    where,
    outFields: PARCEL_FIELDS.join(","),
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${HUMBOLDT_PARCEL_URL}?${params}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.features?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── Build intelligence summary from county data ──

function buildIntelligenceSummary(props: any): string {
  const parts: string[] = [];

  if (props.ZONING) parts.push(`Zoning: ${props.ZONING}`);
  if (props.GEN_PLAN?.trim()) parts.push(`General Plan: ${props.GEN_PLAN.trim()}`);
  if (props.ACRES) parts.push(`Lot size: ${parseFloat(props.ACRES).toFixed(2)} acres`);
  if (props.LOTSIZE) parts.push(`Assessor lot size: ${parseFloat(props.LOTSIZE).toLocaleString()} sqft`);
  if (props.YEAR_BUILT?.trim()) parts.push(`Year built: ${props.YEAR_BUILT.trim()}`);
  if (props.CZ === "Y") parts.push("In Coastal Zone");
  if (props.FZ === "Y") parts.push("In Flood Zone");
  if (props.SRA === "Y") parts.push("State Fire Responsibility Area");
  if (props.TRANDATE) {
    const d = new Date(props.TRANDATE);
    if (!isNaN(d.getTime())) parts.push(`Last transfer: ${d.toISOString().slice(0, 10)}`);
  }
  if (props.LEGAL?.trim()) parts.push(`Legal: ${props.LEGAL.trim()}`);

  return parts.join("\n");
}

// ── API handler ──

export async function POST(req: NextRequest) {
  try {
    const projectId = req.nextUrl.searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "projectId is required" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;

    // Get the project + property
    const project = await db
      .prepare(
        `SELECT p.id, p.name, p.property_id, pr.apn, pr.address, pr.city
         FROM projects p
         JOIN properties pr ON p.property_id = pr.id
         WHERE p.id = ?`
      )
      .bind(projectId)
      .first();

    if (!project) {
      return NextResponse.json(
        { error: "project not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }

    const apn = project.apn as string;
    if (!apn) {
      return NextResponse.json(
        { error: "property has no APN" },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Check if we already have AI research evidence for this project
    const existing = await db
      .prepare("SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' LIMIT 1")
      .bind(projectId)
      .first();

    if (existing) {
      return NextResponse.json(
        { message: "Intelligence already gathered for this project", projectId },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    // Fetch county parcel data
    const parcel = await fetchParcelByAPN(apn);

    if (!parcel) {
      // Record that we attempted but found nothing
      await db
        .prepare(
          `INSERT INTO evidence (id, project_id, source, doc_type, title, status, extracted_text, ai_summary)
           VALUES (?, ?, 'ai_research', 'parcel_lookup', 'Humboldt County Parcel Lookup (No Result)', 'processed', ?, ?)`
        )
        .bind(
          uuid(),
          projectId,
          `APN ${apn} not found in Humboldt County GIS.`,
          "No parcel record found in the Humboldt County GIS system for this APN. The parcel may be in a different county or the APN format may not match the county's records."
        )
        .run();

      return NextResponse.json(
        { message: "No parcel found in county GIS", projectId, apn },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    const props = parcel.properties || {};
    const summary = buildIntelligenceSummary(props);
    const addr = props.FULLADDR?.trim() || project.address || "No address on file";
    const city = props.SITCITY || project.city || "";
    const fullAddr = city ? `${addr}, ${city}, CA` : addr;

    // Update property record with county data
    await db
      .prepare(
        `UPDATE properties SET
           address = COALESCE(NULLIF(?, ''), address),
           city = COALESCE(NULLIF(?, ''), city),
           zoning = COALESCE(?, zoning),
           acres = COALESCE(?, acres),
           legal_desc = COALESCE(?, legal_desc),
           geom_geojson = COALESCE(?, geom_geojson),
           updated_at = datetime('now')
         WHERE id = ?`
      )
      .bind(
        props.FULLADDR?.trim() || null,
        props.SITCITY || null,
        props.ZONING || null,
        props.ACRES ? parseFloat(props.ACRES) : null,
        props.LEGAL?.trim() || null,
        parcel.geometry ? JSON.stringify(parcel.geometry) : null,
        project.property_id
      )
      .run();

    // Create intelligence evidence record
    const evidenceId = uuid();
    const title = `Property Intelligence Report — APN ${props.APN_12 || apn}`;

    const extractedText = [
      `Humboldt County Parcel Data (GIS v13.5)`,
      ``,
      `APN: ${props.APN_12 || apn}`,
      `Address: ${fullAddr}`,
      `Zoning: ${props.ZONING || "Unknown"}`,
      `General Plan: ${props.GEN_PLAN?.trim() || "Unknown"}`,
      `Lot Size: ${props.ACRES ? parseFloat(props.ACRES).toFixed(2) + " acres" : "Unknown"}`,
      `Year Built: ${props.YEAR_BUILT?.trim() || "Unknown"}`,
      `Coastal Zone: ${props.CZ === "Y" ? "Yes" : "No"}`,
      `Flood Zone: ${props.FZ === "Y" ? "Yes" : "No"}`,
      `Fire Responsibility: ${props.SRA === "Y" ? "State (SRA)" : "Local/Other"}`,
      `Supervisor District: ${props.SUPD_DIST || "Unknown"}`,
      props.LEGAL?.trim() ? `Legal Description: ${props.LEGAL.trim()}` : "",
    ].filter(Boolean).join("\n");

    await db
      .prepare(
        `INSERT INTO evidence (id, project_id, source, doc_type, title, status, extracted_text, ai_summary)
         VALUES (?, ?, 'ai_research', 'intelligence_report', ?, 'processed', ?, ?)`
      )
      .bind(evidenceId, projectId, title, extractedText, summary)
      .run();

    // Create timeline event for the intelligence gathering
    await db
      .prepare(
        `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description)
         VALUES (?, ?, ?, datetime('now'), 'intelligence_gathered', ?)`
      )
      .bind(
        uuid(),
        projectId,
        evidenceId,
        `Property intelligence report generated from Humboldt County GIS for APN ${apn}`
      )
      .run();

    return NextResponse.json(
      {
        message: "Property intelligence gathered",
        projectId,
        evidenceId,
        summary,
        parcelData: {
          apn: props.APN_12 || apn,
          address: fullAddr,
          zoning: props.ZONING,
          acres: props.ACRES ? parseFloat(props.ACRES) : null,
          coastalZone: props.CZ === "Y",
          floodZone: props.FZ === "Y",
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err), stack: (err as Error)?.stack },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
