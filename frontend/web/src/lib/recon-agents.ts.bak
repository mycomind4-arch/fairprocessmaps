/**
 * Multi-Agent Property Intelligence Reconnaissance
 * 
 * Each "agent" is an independent data-gathering function that queries a specific
 * Humboldt County data source and writes results to D1. All agents run in parallel
 * via Promise.allSettled() — one agent failing doesn't block the others.
 * 
 * Agents are called by runRecon() in auto-triggers.ts whenever a project is opened.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { RECORDS_AGENTS } from "./recon-agents-records";
import { runAnalysisAgents } from "./analysis-agents";

// ── ArcGIS endpoints ──

const ARCGIS_BASE = "https://cty-gis-web.co.humboldt.ca.us/server/rest/services";
const PARCELS_URL = `${ARCGIS_BASE}/Parcels/Parcels/MapServer/0`;
const ZONING_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/1`;
const GENPLAN_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/5`;
const CITY_BOUNDARY_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/12`;
const SUPERVISOR_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/17`;
const SCHOOL_DIST_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/13`;
const FIRE_DIST_URL = `${ARCGIS_BASE}/Web/Jurisdiction_Boundaries_Public/MapServer/14`;
const COASTAL_ZONE_URL = `${ARCGIS_BASE}/Web/Coastal_Zone/MapServer/0`;
const FEMA_FLOOD_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/13`;
const FIRE_HAZARD_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/33`;
const CAL_FIRE_SRA_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/31`;
const TSUNAMI_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/10`;
const SEA_LEVEL_RISE_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/4`;
const LIQUEFACTION_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/18`;
const LANDSLIDE_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/20`;
const EARTHQUAKE_FAULT_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/28`;
const AIRPORT_COMPAT_URL = `${ARCGIS_BASE}/Web/Hazard_Pub/MapServer/51`;
const ADU_PERMIT_URL = `${ARCGIS_BASE}/Web/ADU_Property_Search/MapServer/1`;
const WETLANDS_URL = `${ARCGIS_BASE}/Web/Natural_Resources_Public/MapServer/7`;
const WILLIAMSON_URL = `${ARCGIS_BASE}/Web/Natural_Resources_Public/MapServer/1`;
const STREAMSIDE_URL = `${ARCGIS_BASE}/Web/Natural_Resources_Public/MapServer/0`;

// ── Helpers ──

function toDashedAPN(apn: string): string {
  const clean = apn.replace(/[-\s]/g, "");
  if (clean.length === 12) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-${clean.slice(9, 12)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`;
  }
  return apn;
}

const PARCEL_FIELDS = [
  "APN_12", "APN", "FULLADDR", "SITCITY", "ACRES", "LOTSIZE",
  "ZONING", "GEN_PLAN", "YEAR_BUILT", "LEGAL", "SUPD_DIST",
  "CZ", "FZ", "FR", "SRA", "TRANDATE", "BKPG", "OLDAPN",
];

interface ParcelData {
  geometry: any;
  properties: Record<string, any>;
  apn: string;
}

async function fetchParcelByAPN(apn: string): Promise<ParcelData | null> {
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = toDashedAPN(apn);
  const where = `APN_12='${dashedAPN}' OR APN_12='${cleanAPN}' OR APN='${cleanAPN}' OR APN='${dashedAPN}'`;

  const params = new URLSearchParams({
    where,
    outFields: PARCEL_FIELDS.join(","),
    outSR: "4326",
    f: "geojson",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${PARCELS_URL}/query?${params}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const feature = data.features?.[0];
    if (!feature) return null;
    return {
      geometry: feature.geometry,
      properties: feature.properties || {},
      apn: feature.properties?.APN_12 || cleanAPN,
    };
  } catch {
    return null;
  }
}

/**
 * Query an ArcGIS MapServer layer by geometry intersection.
 * Returns the first matching feature's attributes, or null.
 */
async function queryLayerByGeometry(
  layerUrl: string,
  geometry: any,
  outFields: string[] = ["*"]
): Promise<Record<string, any> | null> {
  if (!geometry) return null;

  // Use the geometry to query — for GeoJSON Point, use point; for Polygon, use polygon
  let geomType = "esriGeometryPolygon";
  let geomValue: any = geometry;

  if (geometry.type === "Point" || (geometry.type === "point")) {
    geomType = "esriGeometryPoint";
  } else if (geometry.type === "MultiPolygon" || geometry.type === "Polygon") {
    geomType = "esriGeometryPolygon";
    // For polygon geometry, use the envelope for simplicity
    if (geometry.coordinates) {
      // Calculate bounding box
      const coords = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
      const lons = coords.map((c: number[]) => c[0]);
      const lats = coords.map((c: number[]) => c[1]);
      geomValue = {
        xmin: Math.min(...lons),
        ymin: Math.min(...lats),
        xmax: Math.max(...lons),
        ymax: Math.max(...lats),
      };
      geomType = "esriGeometryEnvelope";
    }
  }

  const params = new URLSearchParams({
    geometry: JSON.stringify(geomValue),
    geometryType: geomType,
    spatialRel: "esriSpatialRelIntersects",
    outFields: outFields.join(","),
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${layerUrl}/query?${params}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.features?.[0]?.attributes ?? null;
  } catch {
    return null;
  }
}

/**
 * Query an ArcGIS layer by APN field (some layers have APN).
 */
async function queryLayerByAPN(
  layerUrl: string,
  apn: string,
  apnField: string = "APN_12",
  outFields: string[] = ["*"]
): Promise<Record<string, any> | null> {
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = toDashedAPN(apn);
  const where = `${apnField}='${dashedAPN}' OR ${apnField}='${cleanAPN}'`;

  const params = new URLSearchParams({
    where,
    outFields: outFields.join(","),
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${layerUrl}/query?${params}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.features?.[0]?.attributes ?? null;
  } catch {
    return null;
  }
}

/**
 * Check if a geometry intersects any features in a layer (boolean check).
 */
async function checkIntersection(
  layerUrl: string,
  geometry: any
): Promise<boolean> {
  if (!geometry) return false;

  let geomType = "esriGeometryPolygon";
  let geomValue: any = geometry;

  if (geometry.type === "Point" || (geometry.type === "point")) {
    geomType = "esriGeometryPoint";
  } else if (geometry.coordinates) {
    const coords = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
    const lons = coords.map((c: number[]) => c[0]);
    const lats = coords.map((c: number[]) => c[1]);
    geomValue = {
      xmin: Math.min(...lons),
      ymin: Math.min(...lats),
      xmax: Math.max(...lons),
      ymax: Math.max(...lats),
    };
    geomType = "esriGeometryEnvelope";
  }

  const params = new URLSearchParams({
    geometry: JSON.stringify(geomValue),
    geometryType: geomType,
    spatialRel: "esriSpatialRelIntersects",
    outFields: "*",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "1",
  });

  try {
    const resp = await fetch(`${layerUrl}/query?${params}`);
    if (!resp.ok) return false;
    const data: any = await resp.json();
    return (data.features?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

// ── Agent type ──

export interface ReconAgentResult {
  agent: string;
  status: "success" | "no_data" | "error";
  message: string;
  data?: Record<string, any>;
}

export interface ReconContext {
  apn: string;
  projectId: string;
  propertyId: string;
  organizationId: string;
  db: D1Database;
  parcel: ParcelData | null;
}

export type ReconAgent = (ctx: ReconContext) => Promise<ReconAgentResult>;

// ── Agent 1: Parcel Data ──

const parcelAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel) return { agent: "parcel", status: "no_data", message: "No parcel found in County GIS" };

  const props = ctx.parcel.properties;
  const summary = [
    `APN: ${props.APN_12 || ctx.apn}`,
    `Address: ${props.FULLADDR?.trim() || "Unknown"}`,
    `Zoning: ${props.ZONING || "Unknown"}`,
    `General Plan: ${props.GEN_PLAN?.trim() || "Unknown"}`,
    `Lot Size: ${props.ACRES ? parseFloat(props.ACRES).toFixed(2) + " acres" : "Unknown"}`,
    `Assessor Lot Size: ${props.LOTSIZE ? parseFloat(props.LOTSIZE).toLocaleString() + " sqft" : "Unknown"}`,
    `Year Built: ${props.YEAR_BUILT?.trim() || "Unknown"}`,
    `Coastal Zone: ${props.CZ === "Y" ? "Yes" : "No"}`,
    `Flood Zone: ${props.FZ === "Y" ? "Yes" : "No"}`,
    `Fire Responsibility: ${props.SRA === "Y" ? "State (SRA)" : "Local/Other"}`,
    `Supervisor District: ${props.SUPD_DIST || "Unknown"}`,
    `Last Transfer: ${props.TRANDATE ? new Date(props.TRANDATE).toISOString().slice(0, 10) : "Unknown"}`,
    `Legal: ${props.LEGAL?.trim() || "Unknown"}`,
    `Book/Page: ${props.BKPG || "Unknown"}`,
  ].join("\n");

  // Update property record
  await ctx.db.prepare(
    `UPDATE properties SET
       address = COALESCE(NULLIF(?, ''), address),
       city = COALESCE(NULLIF(?, ''), city),
       zoning = COALESCE(?, zoning),
       acres = COALESCE(?, acres),
       legal_desc = COALESCE(?, legal_desc),
       geom_geojson = COALESCE(?, geom_geojson),
       updated_at = datetime('now')
     WHERE id = ?`
  ).bind(
    props.FULLADDR?.trim() || null,
    props.SITCITY || null,
    props.ZONING || null,
    props.ACRES ? parseFloat(props.ACRES) : null,
    props.LEGAL?.trim() || null,
    ctx.parcel.geometry ? JSON.stringify(ctx.parcel.geometry) : null,
    ctx.propertyId
  ).run();

  return {
    agent: "parcel",
    status: "success",
    message: `Parcel data gathered: ${props.ZONING || "Unknown zoning"}, ${props.ACRES ? parseFloat(props.ACRES).toFixed(2) + " acres" : "Unknown size"}`,
    data: { ...props },
  };
};

// ── Agent 2: Zoning & General Plan ──

const zoningAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "zoning", status: "no_data", message: "No parcel geometry" };

  const [zoning, genPlan] = await Promise.all([
    queryLayerByGeometry(ZONING_URL, ctx.parcel.geometry, ["ZONING", "Q_DESCRIP", "Q"]),
    queryLayerByGeometry(GENPLAN_URL, ctx.parcel.geometry, ["GEN_PLAN", "COMMPLAN", "CPA"]),
  ]);

  if (!zoning && !genPlan) return { agent: "zoning", status: "no_data", message: "No zoning data found" };

  return {
    agent: "zoning",
    status: "success",
    message: `Zoning: ${zoning?.ZONING || "Unknown"}, General Plan: ${genPlan?.GEN_PLAN || "Unknown"}`,
    data: {
      zoning: zoning?.ZONING || ctx.parcel.properties.ZONING,
      zoning_q: zoning?.Q || null,
      zoning_q_description: zoning?.Q_DESCRIP || null,
      general_plan: genPlan?.GEN_PLAN || ctx.parcel.properties.GEN_PLAN,
      community_plan: genPlan?.COMMPLAN || null,
      planning_area: genPlan?.CPA || null,
    },
  };
};

// ── Agent 3: Coastal Zone ──

const coastalZoneAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "coastal_zone", status: "no_data", message: "No parcel geometry" };

  const inCoastalZone = await checkIntersection(COASTAL_ZONE_URL, ctx.parcel.geometry);
  const coastalAttrs = inCoastalZone
    ? await queryLayerByGeometry(COASTAL_ZONE_URL, ctx.parcel.geometry, ["County", "Basis", "CT_ROW", "MBA"])
    : null;

  return {
    agent: "coastal_zone",
    status: "success",
    message: inCoastalZone ? "Property IS in the Coastal Zone" : "Property is NOT in the Coastal Zone",
    data: {
      in_coastal_zone: inCoastalZone,
      coastal_basis: coastalAttrs?.Basis || null,
      coastal_row: coastalAttrs?.CT_ROW || null,
    },
  };
};

// ── Agent 4: FEMA Flood Zone ──

const floodAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "flood", status: "no_data", message: "No parcel geometry" };

  const floodAttrs = await queryLayerByGeometry(FEMA_FLOOD_URL, ctx.parcel.geometry, [
    "ZONE", "FLD_ZONE", "FLOODWAY", "FIRM_PANEL", "EFF_DATE", "COMM",
  ]);

  if (!floodAttrs) {
    return {
      agent: "flood",
      status: "success",
      message: "Property is NOT in a FEMA flood zone",
      data: { in_flood_zone: false, flood_zone_code: null },
    };
  }

  return {
    agent: "flood",
    status: "success",
    message: `In FEMA flood zone: ${floodAttrs.FLD_ZONE || floodAttrs.ZONE || "Unknown"}`,
    data: {
      in_flood_zone: true,
      flood_zone_code: floodAttrs.FLD_ZONE || floodAttrs.ZONE,
      floodway: floodAttrs.FLOODWAY === "1" || floodAttrs.FLOODWAY === "Y",
      firm_panel: floodAttrs.FIRM_PANEL,
      eff_date: floodAttrs.EFF_DATE ? new Date(floodAttrs.EFF_DATE).toISOString().slice(0, 10) : null,
      community: floodAttrs.COMM,
    },
  };
};

// ── Agent 5: Fire Hazard ──

const fireAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "fire", status: "no_data", message: "No parcel geometry" };

  const [fireHazard, sra] = await Promise.all([
    queryLayerByGeometry(FIRE_HAZARD_URL, ctx.parcel.geometry, ["SRA", "FHSZ", "FHSZ_Description"]),
    queryLayerByGeometry(CAL_FIRE_SRA_URL, ctx.parcel.geometry, ["SRA"]),
  ]);

  return {
    agent: "fire",
    status: "success",
    message: `Fire hazard: ${fireHazard?.FHSZ_Description || "Unknown"}, SRA: ${sra?.SRA || fireHazard?.SRA || "Unknown"}`,
    data: {
      fire_hazard_severity: fireHazard?.FHSZ_Description || null,
      fire_hazard_code: fireHazard?.FHSZ || null,
      fire_responsibility: sra?.SRA || fireHazard?.SRA || null,
    },
  };
};

// ── Agent 6: Tsunami ──

const tsunamiAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "tsunami", status: "no_data", message: "No parcel geometry" };

  const inTsunamiZone = await checkIntersection(TSUNAMI_URL, ctx.parcel.geometry);

  return {
    agent: "tsunami",
    status: "success",
    message: inTsunamiZone ? "Property IS in a tsunami hazard area" : "Property is NOT in a tsunami hazard area",
    data: { in_tsunami_zone: inTsunamiZone },
  };
};

// ── Agent 7: Seismic (earthquake fault, liquefaction, landslide) ──

const seismicAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "seismic", status: "no_data", message: "No parcel geometry" };

  const [faultZone, liquefaction, landslide] = await Promise.all([
    checkIntersection(EARTHQUAKE_FAULT_URL, ctx.parcel.geometry),
    queryLayerByGeometry(LIQUEFACTION_URL, ctx.parcel.geometry, ["ZONE", "SLP_STB", "LIQFCTN"]),
    queryLayerByGeometry(LANDSLIDE_URL, ctx.parcel.geometry, ["FEATURE"]),
  ]);

  return {
    agent: "seismic",
    status: "success",
    message: `Fault zone: ${faultZone ? "Yes" : "No"}, Liquefaction: ${liquefaction?.LIQFCTN || "N/A"}, Landslide: ${landslide?.FEATURE || "None"}`,
    data: {
      in_earthquake_fault_zone: faultZone,
      liquefaction_zone: liquefaction?.LIQFCTN || liquefaction?.ZONE || null,
      slope_stability: liquefaction?.SLP_STB || null,
      landslide_feature: landslide?.FEATURE || null,
    },
  };
};

// ── Agent 8: Sea Level Rise ──

const seaLevelRiseAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "sea_level_rise", status: "no_data", message: "No parcel geometry" };

  const atRisk = await checkIntersection(SEA_LEVEL_RISE_URL, ctx.parcel.geometry);

  return {
    agent: "sea_level_rise",
    status: "success",
    message: atRisk ? "Property IS at risk from 1m sea level rise" : "Property is NOT at risk from 1m sea level rise",
    data: { sea_level_rise_risk: atRisk },
  };
};

// ── Agent 9: Airport Compatibility ──

const airportAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "airport", status: "no_data", message: "No parcel geometry" };

  const airportZone = await queryLayerByGeometry(AIRPORT_COMPAT_URL, ctx.parcel.geometry, ["ZONE", "NOISE"]);

  if (!airportZone) {
    return {
      agent: "airport",
      status: "success",
      message: "Property is NOT in an airport compatibility zone",
      data: { in_airport_zone: false },
    };
  }

  return {
    agent: "airport",
    status: "success",
    message: `In airport compatibility zone: ${airportZone.ZONE || "Unknown"}`,
    data: { in_airport_zone: true, airport_zone: airportZone.ZONE },
  };
};

// ── Agent 10: Jurisdiction ──

const jurisdictionAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "jurisdiction", status: "no_data", message: "No parcel geometry" };

  const [cityBoundary, supervisor, schoolDist, fireDist] = await Promise.all([
    checkIntersection(CITY_BOUNDARY_URL, ctx.parcel.geometry),
    queryLayerByGeometry(SUPERVISOR_URL, ctx.parcel.geometry, ["DIST"]),
    queryLayerByGeometry(SCHOOL_DIST_URL, ctx.parcel.geometry, ["NAME"]),
    queryLayerByGeometry(FIRE_DIST_URL, ctx.parcel.geometry, ["NAME"]),
  ]);

  return {
    agent: "jurisdiction",
    status: "success",
    message: `Jurisdiction: ${cityBoundary ? "City" : "County"}, Supervisor District: ${supervisor?.DIST || ctx.parcel.properties.SUPD_DIST || "Unknown"}`,
    data: {
      in_city_limits: cityBoundary,
      supervisor_district: supervisor?.DIST || ctx.parcel.properties.SUPD_DIST || null,
      school_district: schoolDist?.NAME || null,
      fire_district: fireDist?.NAME || null,
    },
  };
};

// ── Agent 11: Natural Resources ──

const naturalResourcesAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "natural_resources", status: "no_data", message: "No parcel geometry" };

  const [wetlands, williamson, streamside] = await Promise.all([
    checkIntersection(WETLANDS_URL, ctx.parcel.geometry),
    queryLayerByGeometry(WILLIAMSON_URL, ctx.parcel.geometry, ["APN", "ACRES", "CONTRACT"]),
    checkIntersection(STREAMSIDE_URL, ctx.parcel.geometry),
  ]);

  const results: string[] = [];
  if (wetlands) results.push("Wetlands on property");
  if (williamson) results.push("Williamson Act Preserve");
  if (streamside) results.push("Streamside Management Area");

  return {
    agent: "natural_resources",
    status: "success",
    message: results.length > 0 ? results.join(", ") : "No special natural resource designations",
    data: {
      has_wetlands: wetlands,
      williamson_act: williamson ? true : false,
      williamson_act_acres: williamson?.ACRES || null,
      has_streamside_area: streamside,
    },
  };
};

// ── Agent 12: ADU Eligibility ──

const aduAgent: ReconAgent = async (ctx): Promise<ReconAgentResult> => {
  if (!ctx.parcel?.geometry) return { agent: "adu", status: "no_data", message: "No parcel geometry" };

  const aduStatus = await queryLayerByGeometry(ADU_PERMIT_URL, ctx.parcel.geometry, ["ADU_Status", "Trigger_"]);

  if (!aduStatus) {
    return {
      agent: "adu",
      status: "success",
      message: "ADU eligibility: No data available",
      data: { adu_eligible: null },
    };
  }

  return {
    agent: "adu",
    status: "success",
    message: `ADU Status: ${aduStatus.ADU_Status || "Unknown"}`,
    data: {
      adu_status: aduStatus.ADU_Status,
      adu_trigger: aduStatus.Trigger_,
    },
  };
};

// ── All Agents Registry ──

export const ALL_AGENTS: { name: string; agent: ReconAgent; description: string }[] = [
  { name: "parcel", agent: parcelAgent, description: "County GIS parcel data (APN, zoning, acres, legal)" },
  { name: "zoning", agent: zoningAgent, description: "Zoning designation & General Plan land use" },
  { name: "coastal_zone", agent: coastalZoneAgent, description: "California Coastal Zone jurisdiction" },
  { name: "flood", agent: floodAgent, description: "FEMA flood zone determination" },
  { name: "fire", agent: fireAgent, description: "Fire hazard severity & responsibility area" },
  { name: "tsunami", agent: tsunamiAgent, description: "Tsunami hazard area" },
  { name: "seismic", agent: seismicAgent, description: "Earthquake fault, liquefaction, landslide" },
  { name: "sea_level_rise", agent: seaLevelRiseAgent, description: "Sea level rise inundation risk" },
  { name: "airport", agent: airportAgent, description: "Airport compatibility zone" },
  { name: "jurisdiction", agent: jurisdictionAgent, description: "City/county jurisdiction, districts" },
  { name: "natural_resources", agent: naturalResourcesAgent, description: "Wetlands, Williamson Act, streamside areas" },
  { name: "adu", agent: aduAgent, description: "ADU (Accessory Dwelling Unit) eligibility" },
  ...RECORDS_AGENTS,
];

// ── Main Recon Orchestrator ──

/**
 * Run full property intelligence recon with all agents in parallel.
 * Each agent independently gathers data from a different source.
 * Results are written to the property_intelligence cache, evidence, and timeline.
 */
export async function runRecon(projectId: string, force: boolean = false): Promise<{
  success: boolean;
  agentCount: number;
  succeeded: number;
  failed: number;
  noData: number;
  results: ReconAgentResult[];
  intelligenceSummary: string;
  evidenceId?: string;
}> {
  const { env } = getCloudflareContext();
  const db = env.DB;

  // Get project + property info
  const project = await db.prepare(
    `SELECT p.id, p.name, p.property_id, p.organization_id, pr.apn, pr.address, pr.city
     FROM projects p
     JOIN properties pr ON p.property_id = pr.id
     WHERE p.id = ?`
  ).bind(projectId).first();

  if (!project) return { success: false, agentCount: 0, succeeded: 0, failed: 0, noData: 0, results: [], intelligenceSummary: "Project not found" };

  const apn = project.apn as string;
  if (!apn) return { success: false, agentCount: 0, succeeded: 0, failed: 0, noData: 0, results: [], intelligenceSummary: "No APN on property" };

  // Check if recon was already done (unless forced)
  if (!force) {
    const existing = await db.prepare(
      `SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND doc_type = 'recon_report' AND organization_id = ? LIMIT 1`
    ).bind(projectId, project.organization_id as string).first();
    if (existing) {
      return {
        success: true,
        agentCount: ALL_AGENTS.length,
        succeeded: 0,
        failed: 0,
        noData: 0,
        results: [],
        intelligenceSummary: "Recon already completed (use force=true to re-run)",
      };
    }
  }

  // If forcing, delete dependent records first (FK constraints), THEN evidence
  if (force) {
    // Delete ALL timeline events that reference ai_research evidence
    await db.prepare(
      `DELETE FROM timeline_events WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`
    ).bind(projectId, project.organization_id as string).run();
    // Delete due_process_findings that reference ai_research evidence
    await db.prepare(
      `DELETE FROM due_process_findings WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`
    ).bind(projectId, project.organization_id as string).run();
    // Delete evidence_relations that reference ai_research evidence
    await db.prepare(
      `DELETE FROM evidence_relations WHERE evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?) OR related_evidence_id IN (SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?)`
    ).bind(projectId, project.organization_id as string, projectId, project.organization_id as string).run();
    // Now safe to delete evidence
    await db.prepare(
      `DELETE FROM evidence WHERE project_id = ? AND source = 'ai_research' AND organization_id = ?`
    ).bind(projectId, project.organization_id as string).run();
    // Delete old property_intelligence cache
    await db.prepare(
      `DELETE FROM property_intelligence WHERE property_id = ?`
    ).bind(project.property_id as string).run();
  }

  // Step 1: Fetch parcel data (needed for geometry-based queries by other agents)
  const parcel = await fetchParcelByAPN(apn);

  // Step 2: Run all agents in parallel
  const ctx: ReconContext = {
    apn,
    projectId,
    propertyId: project.property_id as string,
    organizationId: project.organization_id as string,
    db,
    parcel,
  };

  const agentPromises = ALL_AGENTS.map(({ name, agent }) =>
    agent(ctx).catch((err) => ({
      agent: name,
      status: "error" as const,
      message: err instanceof Error ? err.message : "Unknown error",
    }))
  );

  const settledResults = await Promise.allSettled(agentPromises);
  const results: ReconAgentResult[] = settledResults.map((r, i) => {
    if (r.status === "fulfilled") return r.value as ReconAgentResult;
    return {
      agent: ALL_AGENTS[i].name,
      status: "error",
      message: r.reason?.message || "Agent failed",
    };
  });

  const succeeded = results.filter(r => r.status === "success").length;
  const failed = results.filter(r => r.status === "error").length;
  const noData = results.filter(r => r.status === "no_data").length;

  // Step 3: Build comprehensive intelligence summary
  const intelligenceData: Record<string, any> = {};
  for (const result of results) {
    if (result.data) {
      intelligenceData[result.agent] = result.data;
    }
  }

  const summaryLines: string[] = [
    `FAIRPROCESS PROPERTY INTELLIGENCE RECONNAISSANCE REPORT`,
    `Generated: ${new Date().toISOString()}`,
    `APN: ${apn}`,
    `Project: ${project.name}`,
    ``,
    `=== PARCEL DATA ===`,
    results.find(r => r.agent === "parcel")?.message || "No parcel data",
    ``,
    `=== ZONING & LAND USE ===`,
    results.find(r => r.agent === "zoning")?.message || "No zoning data",
    ``,
    `=== ENVIRONMENTAL HAZARDS ===`,
    `Coastal Zone: ${results.find(r => r.agent === "coastal_zone")?.message || "Unknown"}`,
    `Flood Zone: ${results.find(r => r.agent === "flood")?.message || "Unknown"}`,
    `Fire Hazard: ${results.find(r => r.agent === "fire")?.message || "Unknown"}`,
    `Tsunami: ${results.find(r => r.agent === "tsunami")?.message || "Unknown"}`,
    `Seismic: ${results.find(r => r.agent === "seismic")?.message || "Unknown"}`,
    `Sea Level Rise: ${results.find(r => r.agent === "sea_level_rise")?.message || "Unknown"}`,
    `Airport: ${results.find(r => r.agent === "airport")?.message || "Unknown"}`,
    ``,
    `=== JURISDICTION ===`,
    results.find(r => r.agent === "jurisdiction")?.message || "Unknown",
    ``,
    `=== NATURAL RESOURCES ===`,
    results.find(r => r.agent === "natural_resources")?.message || "No data",
    ``,
    `=== ADU ELIGIBILITY ===`,
    results.find(r => r.agent === "adu")?.message || "No data",
    ``,
    `=== BUILDING PERMITS ===`,
    results.find(r => r.agent === "building_permits")?.message || "No data",
    ``,
    `=== CODE ENFORCEMENT ===`,
    results.find(r => r.agent === "code_enforcement")?.message || "No data",
    ``,
    `=== COUNTY RECORDER ===`,
    results.find(r => r.agent === "county_recorder")?.message || "No data",
    ``,
    `=== DUE PROCESS ANALYSIS ===`,
    results.find(r => r.agent === "due_process_analysis")?.message || "No data",
    ``,
    `=== RECON SUMMARY ===`,
    `Agents run: ${ALL_AGENTS.length}`,
    `Succeeded: ${succeeded}, No data: ${noData}, Failed: ${failed}`,
  ];

  let intelligenceSummary = summaryLines.join("\n");

  // Step 4: Write to property_intelligence cache
  const reconId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO property_intelligence (id, property_id, apn, zoning, general_plan, acres, coastal_zone, flood_zone, fire_responsibility, legal_description, raw_data, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET raw_data = excluded.raw_data, fetched_at = datetime('now')`
  ).bind(
    reconId,
    project.property_id,
    apn,
    intelligenceData.parcel?.zoning || null,
    intelligenceData.zoning?.general_plan || null,
    intelligenceData.parcel?.acres ? parseFloat(intelligenceData.parcel.acres) : null,
    intelligenceData.coastal_zone?.in_coastal_zone ? "Yes" : "No",
    intelligenceData.flood?.in_flood_zone ? "Yes" : "No",
    intelligenceData.fire?.fire_responsibility || null,
    intelligenceData.parcel?.LEGAL || null,
    JSON.stringify(intelligenceData),
  ).run();

  // Step 5: Create evidence record
  const evidenceId = crypto.randomUUID();
  const title = `Property Intelligence Recon — APN ${apn}`;
  await db.prepare(
    `INSERT INTO evidence (id, project_id, organization_id, source, doc_type, title, status, extracted_text, ai_summary)
     VALUES (?, ?, ?, 'ai_research', 'recon_report', ?, 'processed', ?, ?)`
  ).bind(
    evidenceId,
    projectId,
    project.organization_id as string,
    title,
    intelligenceSummary,
    `Full recon: ${succeeded}/${ALL_AGENTS.length} agents succeeded. Key findings: ${results.filter(r => r.status === "success").map(r => r.message).join("; ")}`,
  ).run();

  // Step 6: Create timeline event
  await db.prepare(
    `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
     VALUES (?, ?, ?, datetime('now'), 'intelligence_gathered', ?, ?)`
  ).bind(
    crypto.randomUUID(),
    projectId,
    evidenceId,
    `Full property intelligence recon completed: ${succeeded}/${ALL_AGENTS.length} agents succeeded (${failed} failed, ${noData} no data). Data gathered from Humboldt County GIS: parcel, zoning, coastal zone, flood, fire, tsunami, seismic, sea level rise, airport, jurisdiction, natural resources, ADU eligibility.`,
    project.organization_id as string,
  ).run();

  // Step 7: Run analysis agents (fact extraction, timeline, statute matching, discrepancy)
  // This auto-populates the timeline, discrepancies, and due process findings from all collected data
  try {
    const analysisResult = await runAnalysisAgents({
      projectId,
      propertyId: project.property_id as string,
      organizationId: project.organization_id as string,
      db,
    });
    
    // Add analysis summary to intelligence summary
    intelligenceSummary += `\n\n=== ANALYSIS AGENTS ===\n${analysisResult.summary}`;
  } catch (analysisErr: any) {
    intelligenceSummary += `\n\n=== ANALYSIS AGENTS ===\nAnalysis agents encountered an error: ${analysisErr?.message || "unknown"}`;
  }

  return {
    success: true,
    agentCount: ALL_AGENTS.length,
    succeeded,
    failed,
    noData,
    results,
    intelligenceSummary,
    evidenceId,
  };
}
