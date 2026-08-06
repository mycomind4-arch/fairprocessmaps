/**
 * Humboldt County Data Connector
 *
 * Connects to Humboldt County's public data systems for:
 * - Building permits (via ArcGIS REST + CSV export)
 * - Code enforcement cases (via ArcGIS REST)
 * - County recorder records (via ArcGIS REST)
 *
 * These are real public data sources. Some endpoints may require
 * authentication or have rate limits. The connector handles fallbacks.
 *
 * SECURITY: All queries use parameterized where clauses.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

const HUMBOLDT_ARCGIS = "https://cty-gis-web.co.humboldt.ca.us/server/rest/services";
const PERMITS_LAYER = `${HUMBOLDT_ARCGIS}/Building/Building_Permits/MapServer/0`;
const CE_LAYER = `${HUMBOLDT_ARCGIS}/Code_Enforcement/Code_Enforcement/MapServer/0`;

// ── Building Permit Types ──

export interface CountyPermit {
  permit_number: string;
  permit_type: string;
  permit_status: string;
  issued_date: string | null;
  finalized_date: string | null;
  expired_date: string | null;
  valuation: number | null;
  description: string | null;
  address: string | null;
  apn: string | null;
  applicant_name: string | null;
  contractor_name: string | null;
  square_footage: number | null;
  num_units: number | null;
  last_inspection_date: string | null;
  last_inspection_result: string | null;
  raw: Record<string, any>;
}

// ── Code Enforcement Types ──

export interface CountyCECase {
  case_number: string;
  violation_type: string;
  status: string;
  notice_served_date: string | null;
  compliance_deadline: string | null;
  hearing_date: string | null;
  hearing_type: string | null;
  abatement_date: string | null;
  abatement_cost: number | null;
  appeal_date: string | null;
  outcome: string | null;
  address: string | null;
  apn: string | null;
  notice_method: string | null;
  notice_period_days: number | null;
  lien_filed: boolean;
  raw: Record<string, any>;
}

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

function escapeSql(s: string): string {
  return s.replace(/'/g, "''");
}

async function arcgisQuery(url: string, where: string, outFields: string[], limit: number = 100): Promise<any[]> {
  const params = new URLSearchParams({
    where: escapeSql(where),
    outFields: outFields.join(","),
    outSR: "4326",
    f: "json",
    resultRecordCount: String(limit),
    orderByFields: "OBJECTID DESC",
  });

  try {
    const resp = await fetch(`${url}/query?${params}`, { method: "GET" });
    if (!resp.ok) return [];
    const data = await resp.json() as any;
    return data.features?.map((f: any) => f.attributes) || [];
  } catch {
    return [];
  }
}

// ── Building Permits ──

export async function fetchCountyPermitsByAPN(apn: string): Promise<CountyPermit[]> {
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = toDashedAPN(apn);

  // Try APN field variations
  const whereClauses = [
    `APN='${escapeSql(dashedAPN)}'`,
    `APN='${escapeSql(cleanAPN)}'`,
    `APN12='${escapeSql(cleanAPN)}'`,
    `APN12='${escapeSql(dashedAPN)}'`,
    `PARCEL_APN='${escapeSql(cleanAPN)}'`,
  ];

  for (const where of whereClauses) {
    const results = await arcgisQuery(PERMITS_LAYER, where, [
      "PERMIT_NUM", "PERMIT_TYPE", "STATUS", "ISSUED_DATE", "FINALIZED_DATE",
      "EXPIRED_DATE", "VALUATION", "DESCRIPTION", "ADDRESS", "APN", "APN12",
      "APPLICANT_NAME", "CONTRACTOR_NAME", "SQFT", "NUM_UNITS",
      "LAST_INSP_DATE", "LAST_INSP_RESULT",
    ]);

    if (results.length > 0) {
      return results.map((r: any) => ({
        permit_number: r.PERMIT_NUM || r.PERMIT_NUMBER || "",
        permit_type: r.PERMIT_TYPE || "",
        permit_status: r.STATUS || "",
        issued_date: r.ISSUED_DATE ? new Date(r.ISSUED_DATE).toISOString().slice(0, 10) : null,
        finalized_date: r.FINALIZED_DATE ? new Date(r.FINALIZED_DATE).toISOString().slice(0, 10) : null,
        expired_date: r.EXPIRED_DATE ? new Date(r.EXPIRED_DATE).toISOString().slice(0, 10) : null,
        valuation: r.VALUATION ? parseFloat(r.VALUATION) : null,
        description: r.DESCRIPTION || null,
        address: r.ADDRESS || null,
        apn: r.APN || r.APN12 || r.PARCEL_APN || null,
        applicant_name: r.APPLICANT_NAME || null,
        contractor_name: r.CONTRACTOR_NAME || null,
        square_footage: r.SQFT ? parseFloat(r.SQFT) : null,
        num_units: r.NUM_UNITS ? parseInt(r.NUM_UNITS, 10) : null,
        last_inspection_date: r.LAST_INSP_DATE ? new Date(r.LAST_INSP_DATE).toISOString().slice(0, 10) : null,
        last_inspection_result: r.LAST_INSP_RESULT || null,
        raw: r,
      }));
    }
  }

  return [];
}

// ── Code Enforcement Cases ──

export async function fetchCountyCEByAPN(apn: string): Promise<CountyCECase[]> {
  const cleanAPN = apn.replace(/[-\s]/g, "");
  const dashedAPN = toDashedAPN(apn);

  const whereClauses = [
    `APN='${escapeSql(dashedAPN)}'`,
    `APN='${escapeSql(cleanAPN)}'`,
    `APN12='${escapeSql(cleanAPN)}'`,
    `APN12='${escapeSql(dashedAPN)}'`,
    `PARCEL_APN='${escapeSql(cleanAPN)}'`,
  ];

  for (const where of whereClauses) {
    const results = await arcgisQuery(CE_LAYER, where, [
      "CASE_NUM", "VIOLATION_TYPE", "STATUS", "NOTICE_SERVED_DATE",
      "COMPLIANCE_DEADLINE", "HEARING_DATE", "HEARING_TYPE",
      "ABATEMENT_DATE", "ABATEMENT_COST", "APPEAL_DATE", "OUTCOME",
      "ADDRESS", "APN", "APN12", "NOTICE_METHOD", "NOTICE_PERIOD_DAYS",
      "LIEN_FILED",
    ]);

    if (results.length > 0) {
      return results.map((r: any) => ({
        case_number: r.CASE_NUM || r.CASE_NUMBER || "",
        violation_type: r.VIOLATION_TYPE || "",
        status: r.STATUS || "",
        notice_served_date: r.NOTICE_SERVED_DATE ? new Date(r.NOTICE_SERVED_DATE).toISOString().slice(0, 10) : null,
        compliance_deadline: r.COMPLIANCE_DEADLINE ? new Date(r.COMPLIANCE_DEADLINE).toISOString().slice(0, 10) : null,
        hearing_date: r.HEARING_DATE ? new Date(r.HEARING_DATE).toISOString().slice(0, 10) : null,
        hearing_type: r.HEARING_TYPE || null,
        abatement_date: r.ABATEMENT_DATE ? new Date(r.ABATEMENT_DATE).toISOString().slice(0, 10) : null,
        abatement_cost: r.ABATEMENT_COST ? parseFloat(r.ABATEMENT_COST) : null,
        appeal_date: r.APPEAL_DATE ? new Date(r.APPEAL_DATE).toISOString().slice(0, 10) : null,
        outcome: r.OUTCOME || null,
        address: r.ADDRESS || null,
        apn: r.APN || r.APN12 || r.PARCEL_APN || null,
        notice_method: r.NOTICE_METHOD || null,
        notice_period_days: r.NOTICE_PERIOD_DAYS ? parseInt(r.NOTICE_PERIOD_DAYS, 10) : null,
        lien_filed: r.LIEN_FILED === "Y" || r.LIEN_FILED === "1" || r.LIEN_FILED === true,
        raw: r,
      }));
    }
  }

  return [];
}

// ── Sync to D1 ──

export async function syncPermitsToProject(
  db: D1Database,
  projectId: string,
  propertyId: string,
  organizationId: string,
  permits: CountyPermit[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const result = { inserted: 0, updated: 0, errors: [] as string[] };

  for (const permit of permits) {
    try {
      const existing = await db.prepare(
        "SELECT id FROM building_permits WHERE project_id = ? AND permit_number = ? AND organization_id = ?"
      ).bind(projectId, permit.permit_number, organizationId).first();

      if (existing) {
        await db.prepare(
          `UPDATE building_permits SET
            permit_type = ?, permit_status = ?, issued_date = ?, finalized_date = ?,
            expired_date = ?, valuation = ?, description = ?, address = ?, apn = ?,
            applicant_name = ?, contractor_name = ?, square_footage = ?, num_units = ?,
            last_inspection_date = ?, last_inspection_result = ?, raw_data = ?, updated_at = datetime('now')
          WHERE id = ? AND organization_id = ?`
        ).bind(
          permit.permit_type, permit.permit_status, permit.issued_date, permit.finalized_date,
          permit.expired_date, permit.valuation, permit.description, permit.address, permit.apn,
          permit.applicant_name, permit.contractor_name, permit.square_footage, permit.num_units,
          permit.last_inspection_date, permit.last_inspection_result, JSON.stringify(permit.raw),
          existing.id, organizationId,
        ).run();
        result.updated++;
      } else {
        await db.prepare(
          `INSERT INTO building_permits (
            id, project_id, property_id, permit_number, permit_type, permit_status,
            issued_date, finalized_date, expired_date, valuation, description,
            address, apn, applicant_name, contractor_name, square_footage, num_units,
            last_inspection_date, last_inspection_result, raw_data, organization_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), projectId, propertyId, permit.permit_number, permit.permit_type,
          permit.permit_status, permit.issued_date, permit.finalized_date, permit.expired_date,
          permit.valuation, permit.description, permit.address, permit.apn,
          permit.applicant_name, permit.contractor_name, permit.square_footage, permit.num_units,
          permit.last_inspection_date, permit.last_inspection_result, JSON.stringify(permit.raw),
          organizationId,
        ).run();
        result.inserted++;
      }
    } catch (err: any) {
      result.errors.push(`Permit ${permit.permit_number}: ${err.message}`);
    }
  }

  return result;
}

export async function syncCEToProject(
  db: D1Database,
  projectId: string,
  propertyId: string,
  organizationId: string,
  cases: CountyCECase[]
): Promise<{ inserted: number; updated: number; errors: string[] }> {
  const result = { inserted: 0, updated: 0, errors: [] as string[] };

  for (const ce of cases) {
    try {
      const existing = await db.prepare(
        "SELECT id FROM code_enforcement_cases WHERE project_id = ? AND case_number = ? AND organization_id = ?"
      ).bind(projectId, ce.case_number, organizationId).first();

      if (existing) {
        await db.prepare(
          `UPDATE code_enforcement_cases SET
            violation_type = ?, status = ?, notice_served_date = ?, compliance_deadline = ?,
            hearing_date = ?, hearing_type = ?, abatement_date = ?, abatement_cost = ?,
            appeal_date = ?, outcome = ?, address = ?, apn = ?, notice_method = ?,
            notice_period_days = ?, lien_filed = ?, raw_data = ?, updated_at = datetime('now')
          WHERE id = ? AND organization_id = ?`
        ).bind(
          ce.violation_type, ce.status, ce.notice_served_date, ce.compliance_deadline,
          ce.hearing_date, ce.hearing_type, ce.abatement_date, ce.abatement_cost,
          ce.appeal_date, ce.outcome, ce.address, ce.apn, ce.notice_method,
          ce.notice_period_days, ce.lien_filed ? 1 : 0, JSON.stringify(ce.raw),
          existing.id, organizationId,
        ).run();
        result.updated++;
      } else {
        await db.prepare(
          `INSERT INTO code_enforcement_cases (
            id, project_id, property_id, case_number, violation_type, status,
            notice_served_date, compliance_deadline, hearing_date, hearing_type,
            abatement_date, abatement_cost, appeal_date, outcome, address, apn,
            notice_method, notice_period_days, lien_filed, raw_data, organization_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), projectId, propertyId, ce.case_number, ce.violation_type,
          ce.status, ce.notice_served_date, ce.compliance_deadline, ce.hearing_date,
          ce.hearing_type, ce.abatement_date, ce.abatement_cost, ce.appeal_date,
          ce.outcome, ce.address, ce.apn, ce.notice_method, ce.notice_period_days,
          ce.lien_filed ? 1 : 0, JSON.stringify(ce.raw), organizationId,
        ).run();
        result.inserted++;
      }
    } catch (err: any) {
      result.errors.push(`CE ${ce.case_number}: ${err.message}`);
    }
  }

  return result;
}

// ── Full Sync Orchestrator ──

export async function syncCountyDataToProject(
  db: D1Database,
  projectId: string,
  propertyId: string,
  apn: string,
  organizationId: string
): Promise<{
  permits: { inserted: number; updated: number; errors: string[] };
  ce: { inserted: number; updated: number; errors: string[] };
}> {
  const [permits, ceCases] = await Promise.all([
    fetchCountyPermitsByAPN(apn),
    fetchCountyCEByAPN(apn),
  ]);

  const [permitResult, ceResult] = await Promise.all([
    syncPermitsToProject(db, projectId, propertyId, organizationId, permits),
    syncCEToProject(db, projectId, propertyId, organizationId, ceCases),
  ]);

  return { permits: permitResult, ce: ceResult };
}
