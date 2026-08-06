/**
 * Code Enforcement Data Pipeline — Humboldt County ArcGIS
 *
 * Queries the public ArcGIS Code Enforcement layer and syncs CE cases
 * to D1 for a given property (by APN). Auto-creates timeline events
 * and triggers analysis.
 *
 * Data source:
 *   https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Web/Housing_Public/MapServer/7
 *   Layer: "Code Enforcement Cases 1/15/2025"
 *   Fields: APN_1, RECORD_ID (case #), Type_of_Case_1, DATE_OPENED_1 (epoch ms)
 *   No authentication required — public layer.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

// ── ArcGIS endpoint ──

const ARCGIS_BASE = "https://cty-gis-web.co.humboldt.ca.us/server/rest/services";
const CE_LAYER_URL = `${ARCGIS_BASE}/Web/Housing_Public/MapServer/7`;

// ── Types ──

export interface CECaseRecord {
  case_number: string;
  apn: string;
  violation_type: string | null;
  date_opened: string | null; // ISO date
  raw: Record<string, any>;
}

export interface CESyncResult {
  success: boolean;
  casesFound: number;
  casesCreated: number;
  casesUpdated: number;
  timelineEventsCreated: number;
  cases: CECaseRecord[];
  error?: string;
}

// ── APN helpers ──

/**
 * Convert any APN format to the 12-digit dashed format used by the CE layer.
 * e.g. "205131012" → "205-131-012-000"
 */
function toDashed12(apn: string): string {
  const clean = apn.replace(/[-\s]/g, "");
  if (clean.length === 12) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-${clean.slice(9, 12)}`;
  }
  if (clean.length === 9) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}-000`;
  }
  return apn;
}

/**
 * Generate all plausible APN formats to try in the query.
 */
function apnVariants(apn: string): string[] {
  const clean = apn.replace(/[-\s]/g, "");
  const dashed12 = toDashed12(apn);
  const variants = new Set<string>([dashed12, clean]);
  // Also try without trailing -000
  if (dashed12.endsWith("-000")) {
    variants.add(dashed12.slice(0, -4));
  }
  // Try 9-digit dashed
  if (clean.length >= 9) {
    variants.add(`${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6, 9)}`);
  }
  return Array.from(variants);
}

// ── Fetch CE cases from ArcGIS ──

/**
 * Query the Humboldt County Code Enforcement ArcGIS layer by APN.
 * Returns all matching CE case records.
 */
export async function fetchCECasesByAPN(apn: string): Promise<CECaseRecord[]> {
  const variants = apnVariants(apn);
  // Build WHERE clause trying all APN format variants
  const whereClause = variants.map(v => `APN_1='${v}'`).join(" OR ");

  const params = new URLSearchParams({
    where: whereClause,
    outFields: "APN_1,RECORD_ID,Type_of_Case_1,DATE_OPENED_1",
    returnGeometry: "false",
    f: "json",
    resultRecordCount: "50",
  });

  const url = `${CE_LAYER_URL}/query?${params}`;

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "FairProcess-PropertyIntel/1.0" },
    });
    if (!resp.ok) {
      throw new Error(`ArcGIS returned ${resp.status}`);
    }
    const data: any = await resp.json();

    if (data.error) {
      throw new Error(`ArcGIS error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    const features = data.features || [];
    return features.map((feat: any): CECaseRecord => {
      const attrs = feat.attributes || {};
      const dateMs = attrs.DATE_OPENED_1;
      let dateOpened: string | null = null;
      if (dateMs && typeof dateMs === "number") {
        dateOpened = new Date(dateMs).toISOString().split("T")[0];
      }
      return {
        case_number: attrs.RECORD_ID || "Unknown",
        apn: attrs.APN_1 || apn,
        violation_type: attrs.Type_of_Case_1 || null,
        date_opened: dateOpened,
        raw: attrs,
      };
    });
  } catch (err) {
    console.error("CE pipeline fetch error:", err);
    return [];
  }
}

// ── Sync CE cases to D1 ──

/**
 * Fetch CE cases from ArcGIS by APN and sync them to the D1 database.
 * Creates new code_enforcement_cases records and timeline events.
 * Does NOT overwrite manually-entered cases — only adds new ones from the county.
 *
 * @param projectId - The project ID to sync CE cases for
 * @param apn - The APN to query
 * @param organizationId - The org to scope records to
 * @param db - D1 database handle (optional — if not provided, uses Cloudflare context)
 */
export async function syncCECases(
  projectId: string,
  apn: string,
  organizationId: string,
  db?: D1Database,
): Promise<CESyncResult> {
  if (!db) {
    const { env } = getCloudflareContext();
    db = env.DB;
  }

  try {
    // Step 1: Fetch CE cases from ArcGIS
    const ceCases = await fetchCECasesByAPN(apn);

    if (ceCases.length === 0) {
      return {
        success: true,
        casesFound: 0,
        casesCreated: 0,
        casesUpdated: 0,
        timelineEventsCreated: 0,
        cases: [],
      };
    }

    // Step 2: Get existing CE case numbers from D1 to avoid duplicates
    const existingResult = await db
      .prepare("SELECT case_number FROM code_enforcement_cases WHERE project_id = ?")
      .bind(projectId)
      .all();
    const existingCaseNumbers = new Set(
      (existingResult.results || []).map((r: any) => r.case_number)
    );

    let casesCreated = 0;
    let timelineEventsCreated = 0;

    // Step 3: Insert new CE cases and create timeline events
    for (const ce of ceCases) {
      if (existingCaseNumbers.has(ce.case_number)) {
        // Update existing case with county data if missing fields
        await db
          .prepare(
            `UPDATE code_enforcement_cases
             SET violation_type = COALESCE(NULLIF(violation_type, ''), ?),
                 violation_description = COALESCE(NULLIF(violation_description, ''), ?)
             WHERE project_id = ? AND case_number = ?
             AND (violation_type IS NULL OR violation_type = '')`
          )
          .bind(ce.violation_type, ce.violation_type, projectId, ce.case_number)
          .run();
        continue;
      }

      const ceId = crypto.randomUUID();

      // Determine severity from case type
      let severity = "moderate";
      const caseType = (ce.violation_type || "").toLowerCase();
      if (caseType.includes("cannabis") || caseType.includes("warrant")) {
        severity = "major";
      } else if (caseType.includes("building")) {
        severity = "moderate";
      }

      await db
        .prepare(
          `INSERT INTO code_enforcement_cases (
            id, project_id, case_number, violation_type, violation_description,
            severity, status, notice_served_date, notice_method, notice_period_days,
            compliance_deadline, abatement_date, abatement_cost, lien_filed,
            hearing_date, hearing_type, appeal_filed, appeal_date, outcome, notes,
            created_at, updated_at, organization_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          ceId, projectId,
          ce.case_number,
          ce.violation_type,
          `County code enforcement case ${ce.case_number} — ${ce.violation_type || "unspecified violation type"}`,
          severity,
          "open",
          ce.date_opened,
          null,
          null,
          null,
          null,
          null,
          0,
          null,
          null,
          0,
          null,
          null,
          `Auto-imported from Humboldt County ArcGIS CE layer. APN: ${ce.apn}. Case type: ${ce.violation_type || "Unknown"}.`,
          new Date().toISOString(), new Date().toISOString(),
          organizationId,
        )
        .run();

      casesCreated++;

      // Create a timeline event for the case opening
      const timelineId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description, organization_id)
           VALUES (?, ?, NULL, ?, 'enforcement', ?, ?)`
        )
        .bind(
          timelineId,
          projectId,
          ce.date_opened || new Date().toISOString().split("T")[0],
          `Code enforcement case opened: ${ce.case_number} (${ce.violation_type || "Unknown type"}) — auto-imported from county GIS`,
          organizationId,
        )
        .run();

      timelineEventsCreated++;
    }

    return {
      success: true,
      casesFound: ceCases.length,
      casesCreated,
      casesUpdated: ceCases.length - casesCreated,
      timelineEventsCreated,
      cases: ceCases,
    };
  } catch (err: any) {
    return {
      success: false,
      casesFound: 0,
      casesCreated: 0,
      casesUpdated: 0,
      timelineEventsCreated: 0,
      cases: [],
      error: err instanceof Error ? err.message : "CE sync failed",
    };
  }
}
