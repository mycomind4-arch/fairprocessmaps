/**
 * Shared intelligence + analysis logic — callable from any API route
 * without needing to self-fetch. Extracted from the route handlers so
 * project creation can auto-trigger both inline.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

// ── Intelligence ──

const HUMBOLDT_PARCEL_URL =
  "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0/query";

const PARCEL_FIELDS = [
  "APN_12", "APN", "FULLADDR", "SITCITY", "ACRES", "LOTSIZE",
  "ZONING", "GEN_PLAN", "YEAR_BUILT", "LEGAL", "SUPD_DIST",
  "CZ", "FZ", "FR", "SRA", "TRANDATE", "BKPG", "OLDAPN",
];

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

async function fetchParcelByAPN(apn: string): Promise<any | null> {
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
    const resp = await fetch(`${HUMBOLDT_PARCEL_URL}?${params}`);
    if (!resp.ok) return null;
    const data: any = await resp.json();
    return data.features?.[0] ?? null;
  } catch {
    return null;
  }
}

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

/**
 * Run property intelligence gathering for a project.
 * Queries Humboldt County GIS, updates property record, creates evidence + timeline event.
 */
export async function runIntelligence(projectId: string): Promise<{
  success: boolean;
  message: string;
  evidenceId?: string;
}> {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const project = await db
    .prepare(
      `SELECT p.id, p.name, p.property_id, pr.apn, pr.address, pr.city
       FROM projects p
       JOIN properties pr ON p.property_id = pr.id
       WHERE p.id = ?`
    )
    .bind(projectId)
    .first();

  if (!project) return { success: false, message: "project not found" };

  const apn = project.apn as string;
  if (!apn) return { success: false, message: "property has no APN" };

  // Skip if already gathered
  const existing = await db
    .prepare("SELECT id FROM evidence WHERE project_id = ? AND source = 'ai_research' LIMIT 1")
    .bind(projectId)
    .first();
  if (existing) return { success: true, message: "already gathered" };

  const parcel = await fetchParcelByAPN(apn);

  if (!parcel) {
    await db
      .prepare(
        `INSERT INTO evidence (id, project_id, source, doc_type, title, status, extracted_text, ai_summary)
         VALUES (?, ?, 'ai_research', 'parcel_lookup', 'Humboldt County Parcel Lookup (No Result)', 'processed', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        projectId,
        `APN ${apn} not found in Humboldt County GIS.`,
        "No parcel record found in the Humboldt County GIS system for this APN."
      )
      .run();
    return { success: true, message: "no parcel found" };
  }

  const props = parcel.properties || {};
  const summary = buildIntelligenceSummary(props);
  const addr = props.FULLADDR?.trim() || (project.address as string) || "No address on file";
  const city = props.SITCITY || (project.city as string) || "";
  const fullAddr = city ? `${addr}, ${city}, CA` : addr;

  // Update property record
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

  const evidenceId = crypto.randomUUID();
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

  await db
    .prepare(
      `INSERT INTO timeline_events (id, project_id, evidence_id, event_date, event_type, description)
       VALUES (?, ?, ?, datetime('now'), 'intelligence_gathered', ?)`
    )
    .bind(
      crypto.randomUUID(),
      projectId,
      evidenceId,
      `Property intelligence report generated from Humboldt County GIS for APN ${apn}`
    )
    .run();

  return { success: true, message: "gathered", evidenceId };
}

// ── Due-process analysis ──

export interface RuleDef {
  id: string;
  name: string;
  description: string;
  severity: "critical" | "warning" | "info";
}

export const RULES: Record<string, RuleDef> = {
  notice_timing: {
    id: "notice_timing",
    name: "Adequate Notice Period",
    description: "Property owner must receive notice at least 10 days before hearing/action",
    severity: "critical",
  },
  hearing_right: {
    id: "hearing_right",
    name: "Right to Hearing",
    description: "Owner must be offered an opportunity to contest before adverse action",
    severity: "critical",
  },
  appeal_pathway: {
    id: "appeal_pathway",
    name: "Appeal Pathway Available",
    description: "Decision must include information on how to appeal",
    severity: "warning",
  },
  abatement_without_notice: {
    id: "abatement_without_notice",
    name: "Abatement Without Notice",
    description: "Property was abated without proper notice or before the compliance period expired",
    severity: "critical",
  },
  permit_review_right: {
    id: "permit_review_right",
    name: "Permit Review Rights",
    description: "Permit was denied or expired without opportunity for review or appeal",
    severity: "warning",
  },
  ce_outcome_review: {
    id: "ce_outcome_review",
    name: "Code Enforcement Outcome Review",
    description: "Code enforcement case closed without recorded appeal opportunity",
    severity: "info",
  },
};

const NOTICE_MIN_DAYS = 10;

interface Finding {
  rule: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  evidence_id: string | null;
}

function analyzeProject(
  evidence: any[],
  timeline: any[],
  ceCases: any[] = [],
  permits: any[] = []
): { findings: Finding[]; score: number; summary: string } {
  const findings: Finding[] = [];

  // Rule 1: Notice timing
  const noticeEvents = timeline.filter((e) =>
    (e.event_type || "").toLowerCase().includes("notice")
  );
  const actionEvents = timeline.filter((e) => {
    const t = (e.event_type || "").toLowerCase();
    return ["hearing", "decision", "enforcement", "fine", "penalty", "lien", "demolition"].some((x) =>
      t.includes(x)
    );
  });

  for (const action of actionEvents) {
    const actionDate = new Date(action.event_date);
    if (isNaN(actionDate.getTime())) continue;

    const matchingNotices = noticeEvents.filter((n) => {
      const noticeDate = new Date(n.event_date);
      return !isNaN(noticeDate.getTime()) && noticeDate <= actionDate;
    });

    if (matchingNotices.length === 0) {
      findings.push({
        rule: "notice_timing",
        severity: "critical",
        detail: `No prior notice found before ${action.event_type} on ${action.event_date}`,
        evidence_id: action.evidence_id || null,
      });
    } else {
      const latestNotice = matchingNotices.reduce((latest, n) => {
        const d = new Date(n.event_date);
        return d > new Date(latest.event_date) ? n : latest;
      });
      const daysDiff = Math.floor(
        (actionDate.getTime() - new Date(latestNotice.event_date).getTime()) / 86400000
      );
      if (daysDiff < NOTICE_MIN_DAYS) {
        findings.push({
          rule: "notice_timing",
          severity: "warning",
          detail: `Only ${daysDiff} days between notice and action (minimum: ${NOTICE_MIN_DAYS})`,
          evidence_id: latestNotice.evidence_id || null,
        });
      }
    }
  }

  // Rule 2: Hearing right — adverse action without recorded hearing
  const hasHearing = timeline.some((e) =>
    (e.event_type || "").toLowerCase().includes("hearing")
  );
  const hasAdverseAction = timeline.some((e) => {
    const t = (e.event_type || "").toLowerCase();
    return ["fine", "penalty", "lien", "demolition", "eviction"].some((x) => t.includes(x));
  });

  if (hasAdverseAction && !hasHearing) {
    findings.push({
      rule: "hearing_right",
      severity: "critical",
      detail: "Adverse action taken without recorded hearing opportunity",
      evidence_id: null,
    });
  }

  // Rule 3: Appeal pathway — decisions should mention appeal rights
  const decisionEvents = timeline.filter((e) =>
    (e.event_type || "").toLowerCase().includes("decision")
  );
  for (const decision of decisionEvents) {
    if (!decision.evidence_id) continue;
    const ev = evidence.find((e) => e.id === decision.evidence_id);
    if (!ev) continue;
    const text = `${ev.extracted_text || ""} ${ev.ai_summary || ""}`.toLowerCase();
    if (!text.includes("appeal") && !text.includes("review")) {
      findings.push({
        rule: "appeal_pathway",
        severity: "warning",
        detail: `Decision on ${decision.event_date} does not mention appeal rights`,
        evidence_id: decision.evidence_id,
      });
    }
  }

  // Rule 4: Abatement without notice (from CE cases)
  for (const ce of ceCases) {
    if (ce.abatement_date) {
      // Check if notice was served before abatement
      if (!ce.notice_served_date) {
        findings.push({
          rule: "abatement_without_notice",
          severity: "critical",
          detail: `Property abated on ${ce.abatement_date} without recorded notice of violation`,
          evidence_id: null,
        });
      } else {
        const noticeDate = new Date(ce.notice_served_date);
        const abateDate = new Date(ce.abatement_date);
        if (!isNaN(noticeDate.getTime()) && !isNaN(abateDate.getTime())) {
          const daysDiff = Math.floor((abateDate.getTime() - noticeDate.getTime()) / 86400000);
          const minDays = ce.notice_period_days || 10;
          if (daysDiff < minDays) {
            findings.push({
              rule: "abatement_without_notice",
              severity: "critical",
              detail: `Abatement occurred ${daysDiff} days after notice (compliance period: ${minDays} days) \u2014 ${ce.case_number || ""}`,
              evidence_id: null,
            });
          }
        }
      }
      // Check if hearing was held before abatement
      if (!ce.hearing_date) {
        findings.push({
          rule: "hearing_right",
          severity: "critical",
          detail: `Abatement on ${ce.abatement_date} without a recorded hearing \u2014 ${ce.case_number || ""}`,
          evidence_id: null,
        });
      }
    }

    // Check if case was closed without appeal opportunity
    if (ce.status === "closed" || ce.status === "abated") {
      if (!ce.appeal_filed && !ce.appeal_date && !ce.hearing_date) {
        findings.push({
          rule: "ce_outcome_review",
          severity: "info",
          detail: `Case ${ce.case_number || ""} closed without hearing or appeal on record`,
          evidence_id: null,
        });
      }
    }
  }

  // Rule 5: Permit review rights (from building permits)
  for (const permit of permits) {
    // Denied permit without hearing
    if (permit.permit_status === "denied" && !permit.finalized_date) {
      findings.push({
        rule: "permit_review_right",
        severity: "warning",
        detail: `Permit ${permit.permit_number || ""} denied without recorded review or appeal opportunity`,
        evidence_id: null,
      });
    }
    // Expired permit that was never issued
    if (permit.permit_status === "expired" && !permit.issued_date) {
      findings.push({
        rule: "permit_review_right",
        severity: "warning",
        detail: `Permit ${permit.permit_number || ""} expired without being issued \u2014 no review opportunity recorded`,
        evidence_id: null,
      });
    }
  }

  // Calculate score
  const critical = findings.filter((f) => f.severity === "critical").length;
  const warning = findings.filter((f) => f.severity === "warning").length;
  const info = findings.filter((f) => f.severity === "info").length;
  const score = Math.max(0, 100 - critical * 25 - warning * 10 - info * 3);

  const summary = `Analysis complete: ${findings.length} finding(s) \u2014 ${critical} critical, ${warning} warning, ${info} info.`;

  return { findings, score, summary };
}

/**
 * Run due-process analysis for a project.
 * Evaluates timeline events against rules, writes findings, updates score.
 */
export async function runAnalysis(projectId: string): Promise<{
  score: number;
  summary: string;
  findingsCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  findings: Finding[];
}> {
  const { env } = getCloudflareContext();
  const db = env.DB;

  const evidenceResult = await db
    .prepare("SELECT id, extracted_text, ai_summary, title, source, doc_type FROM evidence WHERE project_id = ?")
    .bind(projectId)
    .all();

  const timelineResult = await db
    .prepare("SELECT id, event_date, event_type, description, evidence_id FROM timeline_events WHERE project_id = ? ORDER BY event_date ASC")
    .bind(projectId)
    .all();

  const ceResult = await db
    .prepare("SELECT * FROM code_enforcement_cases WHERE project_id = ?")
    .bind(projectId)
    .all();

  const permitsResult = await db
    .prepare("SELECT * FROM building_permits WHERE project_id = ?")
    .bind(projectId)
    .all();

  const evidence = evidenceResult.results ?? [];
  const timeline = timelineResult.results ?? [];
  const ceCases = ceResult.results ?? [];
  const permits = permitsResult.results ?? [];

  const { findings, score, summary } = analyzeProject(evidence, timeline, ceCases, permits);

  // Clear old findings
  await db.prepare("DELETE FROM due_process_findings WHERE project_id = ?").bind(projectId).run();

  // Insert new findings
  for (const finding of findings) {
    await db
      .prepare(
        `INSERT INTO due_process_findings (id, project_id, rule, rule_name, severity, status, detail, evidence_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        projectId,
        finding.rule,
        RULES[finding.rule]?.name ?? finding.rule,
        finding.severity,
        finding.detail,
        finding.evidence_id
      )
      .run();
  }

  // Update project's due_process_score
  await db
    .prepare("UPDATE projects SET due_process_score = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(score, projectId)
    .run();

  return {
    score,
    summary,
    findingsCount: findings.length,
    criticalCount: findings.filter((f) => f.severity === "critical").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
    infoCount: findings.filter((f) => f.severity === "info").length,
    findings,
  };
}
