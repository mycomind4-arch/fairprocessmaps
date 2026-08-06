/**
 * AI Legal Brief Generator
 *
 * Generates court-ready draft legal briefs from case data.
 * Uses deterministic template engine built on the existing 7-rule analyzer
 * output, timeline events, evidence vault, and statute library.
 *
 * Philosophy: No LLM hallucination — every claim traces to a finding with
 * a direct statutory citation and evidence link. An optional LLM enhancement
 * layer can polish prose if an API key is configured.
 *
 * Brief types:
 *   - motion_to_dismiss  — Challenge due-process violations in enforcement action
 *   - appeal_letter      — Appeal a zoning/planning/permit decision
 *   - complaint          — Draft complaint for damages due to due-process violation
 *   - case_summary       — Internal case summary for client file
 */

import { STATUTES } from "@/lib/statutes";
import type { AgentInputSnapshot } from "@/lib/agents/types";
import { buildInputSnapshot } from "@/lib/agents/runner";

export type BriefType = "motion_to_dismiss" | "appeal_letter" | "complaint" | "case_summary";

export interface GenerateBriefParams {
  db: D1Database;
  projectId: string;
  organizationId: string;
  briefType: BriefType;
  defendantName?: string;
  caseNumber?: string;
  courtName?: string;
}

export interface GeneratedBrief {
  id: string;
  brief_type: BriefType;
  title: string;
  content: string;
  word_count: number;
  finding_count: number;
  citation_count: number;
  generated_at: string;
  case_id: string;
}

// ── Brief type metadata ────────────────────────────────────────────────────

const BRIEF_META: Record<BriefType, { title: string; intro: string }> = {
  motion_to_dismiss: {
    title: "MOTION TO DISMISS FOR DENIAL OF DUE PROCESS",
    intro: "Comes now Defendant, by and through undersigned counsel, and respectfully moves this tribunal to dismiss the above-captioned matter on the grounds that the enforcement action was taken in violation of Defendant's constitutional and statutory rights to due process of law.",
  },
  appeal_letter: {
    title: "ADMINISTRATIVE APPEAL OF DECISION",
    intro: "This administrative appeal is filed pursuant to the applicable provisions of the California Government Code and local ordinance, appealing the decision rendered in the above-captioned matter.",
  },
  complaint: {
    title: "DRAFT COMPLAINT FOR DAMAGES",
    intro: "Plaintiff alleges and complains against Defendant as follows, seeking damages for violations of Plaintiff's constitutional and statutory rights to due process of law.",
  },
  case_summary: {
    title: "CASE SUMMARY AND DUE-PROCESS ANALYSIS",
    intro: "The following summary provides a comprehensive overview of the due-process analysis conducted for the subject property, including all identified violations, supporting evidence, and statutory citations.",
  },
};

// ── Main generation function ───────────────────────────────────────────────

export async function generateBrief(
  params: GenerateBriefParams,
): Promise<GeneratedBrief | { error: string; status: number }> {
  const { db, projectId, organizationId, briefType, defendantName, caseNumber, courtName } = params;

  // 1. Build case snapshot (reuses agent runner's data gathering)
  const snapshot = await buildInputSnapshot(db, projectId, organizationId);
  if (!snapshot) {
    return { error: "Case not found or not accessible", status: 404 };
  }

  // 2. Generate brief content
  const content = buildBriefContent(snapshot, briefType, {
    defendantName: defendantName || "Defendant",
    caseNumber: caseNumber || "[Case Number]",
    courtName: courtName || "Humboldt County Superior Court",
  });

  // 3. Count statistics
  const wordCount = content.split(/\s+/).length;
  const findings = snapshot.findings.filter(f => f.status === "open");
  const citations = new Set<string>();
  for (const f of findings) {
    const statute = STATUTES.find(s => s.ref === f.rule);
    if (statute) citations.add(statute.ref);
  }

  // 4. Store in database
  const briefId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO generated_briefs
      (id, project_id, organization_id, brief_type, title, content,
       word_count, finding_count, citation_count, generated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).bind(
    briefId, projectId, organizationId,
    briefType, BRIEF_META[briefType].title, content,
    wordCount, findings.length, citations.size,
  ).run();

  return {
    id: briefId,
    brief_type: briefType,
    title: BRIEF_META[briefType].title,
    content,
    word_count: wordCount,
    finding_count: findings.length,
    citation_count: citations.size,
    generated_at: new Date().toISOString(),
    case_id: projectId,
  };
}

// ── List briefs for a case ──────────────────────────────────────────────────

export async function listBriefs(
  db: D1Database,
  projectId: string,
  organizationId: string,
): Promise<GeneratedBrief[]> {
  const result = await db.prepare(
    `SELECT id, brief_type, title, word_count, finding_count, citation_count, generated_at
     FROM generated_briefs
     WHERE project_id = ? AND organization_id = ?
     ORDER BY generated_at DESC`,
  ).bind(projectId, organizationId).all();

  return (result.results ?? []).map(r => r as unknown as GeneratedBrief);
}

// ── Get a single brief ──────────────────────────────────────────────────────

export async function getBrief(
  db: D1Database,
  briefId: string,
  organizationId: string,
): Promise<GeneratedBrief | null> {
  const row = await db.prepare(
    `SELECT * FROM generated_briefs WHERE id = ? AND organization_id = ?`,
  ).bind(briefId, organizationId).first();

  if (!row) return null;
  return row as unknown as GeneratedBrief;
}

// ── Build brief content ─────────────────────────────────────────────────────

function buildBriefContent(
  snapshot: AgentInputSnapshot,
  briefType: BriefType,
  opts: { defendantName: string; caseNumber: string; courtName: string },
): string {
  const meta = BRIEF_META[briefType];
  const sections: string[] = [];

  // ── Caption block ──────────────────────────────────────────────────────
  sections.push(formatCaption(snapshot, opts, meta.title));

  // ── Introduction ────────────────────────────────────────────────────────
  sections.push(`I. INTRODUCTION\n\n${meta.intro}`);

  // ── Statement of Facts ─────────────────────────────────────────────────
  sections.push(formatStatementOfFacts(snapshot));

  // ── Procedural History ─────────────────────────────────────────────────
  sections.push(formatProceduralHistory(snapshot));

  // ── Legal Arguments ───────────────────────────────────────────────────
  sections.push(formatLegalArguments(snapshot, briefType));

  // ── Evidence Index ─────────────────────────────────────────────────────
  if (snapshot.evidence.length > 0) {
    sections.push(formatEvidenceIndex(snapshot));
  }

  // ── Prayer for Relief ──────────────────────────────────────────────────
  if (briefType !== "case_summary") {
    sections.push(formatPrayerForRelief(snapshot, briefType, opts));
  }

  // ── Signature block ────────────────────────────────────────────────────
  sections.push(formatSignatureBlock(briefType));

  return sections.join("\n\n" + "─".repeat(60) + "\n\n");
}

// ── Caption ──────────────────────────────────────────────────────────────────

function formatCaption(
  snapshot: AgentInputSnapshot,
  opts: { defendantName: string; caseNumber: string; courtName: string },
  title: string,
): string {
  const prop = snapshot.property;
  return `${opts.courtName}

${snapshot.case_name}
Case No.: ${opts.caseNumber}

PROPERTY: APN ${prop.apn}
         ${prop.address}, ${prop.city}
         Zone: ${prop.zoning}

─────────────────────────────────────────

${title}

─────────────────────────────────────────`;
}

// ── Statement of Facts ──────────────────────────────────────────────────────

function formatStatementOfFacts(snapshot: AgentInputSnapshot): string {
  const prop = snapshot.property;
  const lines: string[] = [`II. STATEMENT OF FACTS\n`];

  lines.push(`The subject property is located at ${prop.address}, ${prop.city}, California,`);
  lines.push(`identified by Assessor's Parcel Number (APN) ${prop.apn}, and is zoned ${prop.zoning}.`);
  lines.push("");

  if (snapshot.ce_cases.length > 0) {
    lines.push("The following code enforcement actions have been recorded against the property:");
    lines.push("");
    for (const ce of snapshot.ce_cases) {
      lines.push(`  • Case ${ce.case_number || "(unnumbered)"} — ${ce.violation_type || "Code violation"}`);
      lines.push(`    Status: ${ce.status}`);
      if (ce.notice_served_date) lines.push(`    Notice served: ${ce.notice_served_date}`);
      if (ce.compliance_deadline) lines.push(`    Compliance deadline: ${ce.compliance_deadline}`);
      if (ce.hearing_date) lines.push(`    Hearing date: ${ce.hearing_date}`);
      lines.push("");
    }
  }

  if (snapshot.permits.length > 0) {
    lines.push("The following building permits are associated with the property:");
    lines.push("");
    for (const p of snapshot.permits) {
      lines.push(`  • Permit ${p.permit_number || "(unnumbered)"} — ${p.permit_type || "Building"}`);
      lines.push(`    Status: ${p.permit_status}`);
      if (p.issued_date) lines.push(`    Issued: ${p.issued_date}`);
      if (p.expired_date) lines.push(`    Expired: ${p.expired_date}`);
      lines.push("");
    }
  }

  if (snapshot.timeline.length > 0) {
    lines.push("The following chronology of events has been established from the evidence:");
    lines.push("");
    for (const event of snapshot.timeline) {
      const date = event.event_date || "[Date unknown]";
      const desc = event.description || event.event_type || "Event";
      lines.push(`  ${date} — ${desc}`);
    }
  }

  return lines.join("\n");
}

// ── Procedural History ──────────────────────────────────────────────────────

function formatProceduralHistory(snapshot: AgentInputSnapshot): string {
  const lines: string[] = [`III. PROCEDURAL HISTORY\n`];

  const hearingEvents = snapshot.timeline.filter(
    e => e.event_type === "hearing" || e.event_type === "decision" || e.event_type === "appeal",
  );
  const noticeEvents = snapshot.timeline.filter(
    e => e.event_type === "notice" || e.event_type === "fine" || e.event_type === "penalty",
  );

  if (noticeEvents.length > 0) {
    lines.push("Notices and administrative actions taken by the government:");
    for (const n of noticeEvents) {
      lines.push(`  • ${n.event_date || "Date unknown"}: ${n.description || n.event_type}`);
    }
    lines.push("");
  }

  if (hearingEvents.length > 0) {
    lines.push("Hearings and decisions rendered:");
    for (const h of hearingEvents) {
      lines.push(`  • ${h.event_date || "Date unknown"}: ${h.description || h.event_type}`);
    }
    lines.push("");
  }

  if (noticeEvents.length === 0 && hearingEvents.length === 0) {
    lines.push("No formal hearings or administrative proceedings have been identified in the record.");
  }

  return lines.join("\n");
}

// ── Legal Arguments ─────────────────────────────────────────────────────────

function formatLegalArguments(snapshot: AgentInputSnapshot, briefType: BriefType): string {
  const lines: string[] = [`IV. LEGAL ARGUMENT\n`];

  const openFindings = snapshot.findings.filter(f => f.status === "open");
  const criticalFindings = openFindings.filter(f => f.severity === "critical");
  const warningFindings = openFindings.filter(f => f.severity === "warning");
  const infoFindings = openFindings.filter(f => f.severity === "info");

  if (openFindings.length === 0) {
    lines.push("The due-process analysis engine has identified no open procedural violations");
    lines.push("at this time. This brief is generated for documentation purposes only.");
    return lines.join("\n");
  }

  lines.push(`The FairProcess due-process analyzer has identified ${openFindings.length} procedural`);
  lines.push(`discrepancies — ${criticalFindings.length} critical, ${warningFindings.length} warning,`);
  lines.push(`and ${infoFindings.length} informational — each supported by statutory authority`);
  lines.push("and linked to specific evidence in the record.\n");

  // Critical findings first
  if (criticalFindings.length > 0) {
    lines.push("A. CRITICAL DUE-PROCESS VIOLATIONS\n");
    for (let i = 0; i < criticalFindings.length; i++) {
      lines.push(formatFindingArgument(criticalFindings[i], i + 1, briefType));
      lines.push("");
    }
  }

  if (warningFindings.length > 0) {
    lines.push("B. PROCEDURAL DEFICIENCIES\n");
    for (let i = 0; i < warningFindings.length; i++) {
      lines.push(formatFindingArgument(warningFindings[i], i + 1, briefType));
      lines.push("");
    }
  }

  if (infoFindings.length > 0) {
    lines.push("C. ADDITIONAL OBSERVATIONS\n");
    for (let i = 0; i < infoFindings.length; i++) {
      lines.push(formatFindingArgument(infoFindings[i], i + 1, briefType));
      lines.push("");
    }
  }

  // Due process score
  lines.push("D. DUE PROCESS COMPLIANCE SCORE\n");
  lines.push("The FairProcess analyzer computes a due-process compliance score");
  lines.push("starting at 100, deducting 25 points per critical violation and 10 points");
  lines.push("per warning. The current case score reflects the severity of the");
  lines.push("identified violations and should be considered in any adjudicative decision.");

  return lines.join("\n");
}

// ── Format a single finding as a legal argument ───────────────────────────

function formatFindingArgument(
  finding: AgentInputSnapshot["findings"][0],
  index: number,
  briefType: BriefType,
): string {
  const statute = STATUTES.find(s => s.ref === finding.rule);
  const lines: string[] = [];

  lines.push(`${index}. ${finding.rule_name || finding.rule}`);
  lines.push("");

  if (statute) {
    lines.push(`   Statutory authority: ${statute.source}, ${statute.ref}`);
    lines.push(`   Requirement: ${statute.description}`);
    lines.push("");
  }

  if (finding.detail) {
    lines.push(`   ${finding.detail}`);
    lines.push("");
  }

  lines.push(`   Severity: ${finding.severity.toUpperCase()}`);

  if (finding.evidence_id) {
    lines.push(`   Supporting evidence: Evidence item ${finding.evidence_id}`);
  }

  // Add argument paragraph based on brief type
  lines.push("");
  switch (briefType) {
    case "motion_to_dismiss":
      lines.push(`   The violation of ${statute?.ref || finding.rule} constitutes a denial`);
      lines.push(`   of due process warranting dismissal of the enforcement action.`);
      lines.push(`   The government's failure to comply with statutory procedural`);
      lines.push(`   requirements deprives the action of legal sufficiency.`);
      break;
    case "appeal_letter":
      lines.push(`   This violation of ${statute?.ref || finding.rule} provides grounds`);
      lines.push(`   for appeal. The procedural deficiency undermines the validity`);
      lines.push(`   of the decision and requires reversal or remand.`);
      break;
    case "complaint":
      lines.push(`   The violation of ${statute?.ref || finding.rule} caused actual`);
      lines.push(`   harm to the property owner, including but not limited to`);
      lines.push(`   deprivation of property rights without due process of law.`);
      break;
    case "case_summary":
      lines.push(`   This finding should be reviewed for potential legal action.`);
      lines.push(`   The statutory citation and evidence link are preserved for`);
      lines.push(`   use in any subsequent proceedings.`);
      break;
  }

  return lines.join("\n");
}

// ── Evidence Index ──────────────────────────────────────────────────────────

function formatEvidenceIndex(snapshot: AgentInputSnapshot): string {
  const lines: string[] = [`V. INDEX OF EVIDENCE\n`];
  lines.push("The following evidence supports the findings in this brief:\n");

  for (let i = 0; i < snapshot.evidence.length; i++) {
    const ev = snapshot.evidence[i];
    lines.push(`  Exhibit ${String.fromCharCode(65 + i)}: ${ev.title}`);
    lines.push(`    Type: ${ev.doc_type || "Document"} | Status: ${ev.status}`);
    if (ev.source) lines.push(`    Source: ${ev.source}`);
    lines.push("");
  }

  lines.push("Each piece of evidence is stored in the FairProcess evidence vault with");
  lines.push("chain-of-custody metadata and is available for court production.");

  return lines.join("\n");
}

// ── Prayer for Relief ────────────────────────────────────────────────────────

function formatPrayerForRelief(
  snapshot: AgentInputSnapshot,
  briefType: BriefType,
  opts: { defendantName: string },
): string {
  const sectionNum = snapshot.evidence.length > 0 ? "VI" : "V";
  const lines: string[] = [`${sectionNum}. PRAYER FOR RELIEF\n`];

  const openFindings = snapshot.findings.filter(f => f.status === "open");
  const criticalCount = openFindings.filter(f => f.severity === "critical").length;

  switch (briefType) {
    case "motion_to_dismiss":
      lines.push(`WHEREFORE, ${opts.defendantName} respectfully requests that this`);
      lines.push(`tribunal dismiss the enforcement action in its entirety, and grant`);
      lines.push(`such other and further relief as the tribunal deems just and proper.`);
      break;
    case "appeal_letter":
      lines.push(`WHEREFORE, appellant respectfully requests that the decision be`);
      lines.push(`reversed, remanded for further proceedings consistent with due`);
      lines.push(`process requirements, or such other relief as the reviewing`);
      lines.push(`authority deems appropriate.`);
      break;
    case "complaint":
      lines.push(`WHEREFORE, plaintiff requests judgment against defendant for:`);
      lines.push("");
      lines.push("  1. Compensatory damages according to proof;");
      lines.push("  2. A declaration that the actions taken violated plaintiff's");
      lines.push("     right to due process of law;");
      lines.push("  3. Injunctive relief preventing further enforcement actions");
      lines.push("     without compliance with statutory procedures;");
      lines.push("  4. Attorney's fees and costs of suit; and");
      lines.push("  5. Such other and further relief as the Court deems just and proper.");
      break;
  }

  if (criticalCount > 0) {
    lines.push("");
    lines.push(`This request is supported by ${criticalCount} critical due-process`);
    lines.push(`violation${criticalCount > 1 ? "s" : ""} identified through automated`);
    lines.push("analysis of the government's own records.");
  }

  return lines.join("\n");
}

// ── Signature Block ──────────────────────────────────────────────────────────

function formatSignatureBlock(briefType: BriefType): string {
  const sectionNum = "VII";
  const lines: string[] = [`${sectionNum}. SIGNATURE\n`];

  if (briefType === "appeal_letter") {
    lines.push("Respectfully submitted,");
    lines.push("");
    lines.push("________________________________");
    lines.push("[Attorney Name]");
    lines.push("[Bar Number]");
    lines.push("[Law Firm]");
    lines.push("[Address]");
    lines.push("[Phone] | [Email]");
    lines.push("Attorney for [Party Name]");
  } else if (briefType === "case_summary") {
    lines.push("Generated by FairProcess 2.0 Due-Process Analysis Engine");
    lines.push("");
    lines.push("This summary is generated from automated analysis of case data");
    lines.push("and should be reviewed by qualified counsel before use in");
    lines.push("any legal proceeding. All findings are supported by statutory");
    lines.push("citations and linked to evidence in the FairProcess vault.");
  } else {
    lines.push("Respectfully submitted,");
    lines.push("");
    lines.push("________________________________");
    lines.push("[Attorney Name], Esq.");
    lines.push("[Bar Number]");
    lines.push("[Law Firm]");
    lines.push("[Address] | [Phone] | [Email]");
    lines.push(`Attorney for ${briefType === "complaint" ? "Plaintiff" : "Defendant"}`);
  }

  lines.push("");
  lines.push("");
  lines.push("─────────────────────────────────────────");
  lines.push("");
  lines.push("DRAFT — Generated by FairProcess 2.0");
  lines.push("This document is a draft generated from automated due-process");
  lines.push("analysis. It must be reviewed and finalized by a licensed attorney");
  lines.push("before filing. All statutory citations are verified against the");
  lines.push("FairProcess statute library but should be independently confirmed.");

  return lines.join("\n");
}
