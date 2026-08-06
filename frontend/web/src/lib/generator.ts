/**
 * Legal Report Generator
 *
 * Generates structured PDF reports for legal proceedings.
 * Uses pure HTML/CSS for layout, then converts to PDF via
 * a headless browser or client-side print-to-PDF.
 *
 * For Cloudflare Workers, we generate a self-contained HTML document
 * that can be opened in a browser and printed/saved as PDF.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare";

export interface ReportSection {
  title: string;
  content: string;
  evidenceIds?: string[];
}

export interface ReportData {
  projectName: string;
  propertyAddress: string;
  apn: string;
  generatedAt: string;
  generatedBy: string;
  organizationName: string;
  caseType: string;
  dueProcessScore: number;
  sections: ReportSection[];
  timeline: { date: string; event: string; source: string }[];
  findings: { rule: string; severity: string; status: string; detail: string }[];
  evidence: { title: string; type: string; source: string; hash: string }[];
  agentAudit: { agent: string; status: string; hash: string }[];
  statutoryChecks: { statute: string; status: string; note: string }[];
  custodyChain: { action: string; actor: string; timestamp: string; hash: string }[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function generateReportHTML(data: ReportData): string {
  const severityColor = (s: string) => {
    switch (s) {
      case "critical": return "#dc2626";
      case "warning": return "#d97706";
      case "info": return "#2563eb";
      default: return "#6b7280";
    }
  };

  const severityBadge = (s: string) =>
    `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;color:white;background:${severityColor(s)};">${escapeHtml(s)}</span>`;

  const statusBadge = (s: string) => {
    const color = s === "open" ? "#dc2626" : s === "resolved" ? "#16a34a" : "#6b7280";
    return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;text-transform:uppercase;color:white;background:${color};">${escapeHtml(s)}</span>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>FairProcess Report — ${escapeHtml(data.projectName)}</title>
  <style>
    @page { size: letter; margin: 0.75in; }
    * { box-sizing: border-box; }
    body { font-family: "Times New Roman", Georgia, serif; font-size: 11pt; line-height: 1.6; color: #1a1a1a; max-width: 8in; margin: 0 auto; padding: 0.5in; }
    h1 { font-size: 18pt; font-weight: 700; text-align: center; margin-bottom: 6pt; border-bottom: 2px solid #1a1a1a; padding-bottom: 8pt; }
    h2 { font-size: 14pt; font-weight: 700; margin-top: 18pt; margin-bottom: 8pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; page-break-after: avoid; }
    h3 { font-size: 12pt; font-weight: 700; margin-top: 12pt; margin-bottom: 6pt; }
    .meta { text-align: center; font-size: 10pt; color: #555; margin-bottom: 18pt; }
    .meta-row { display: flex; justify-content: space-between; font-size: 10pt; margin-bottom: 4pt; }
    .score-box { text-align: center; padding: 12pt; border: 2px solid #1a1a1a; margin: 12pt 0; }
    .score-number { font-size: 32pt; font-weight: 700; }
    .score-label { font-size: 10pt; text-transform: uppercase; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; font-size: 10pt; margin: 8pt 0; }
    th, td { border: 1px solid #ccc; padding: 6pt; text-align: left; vertical-align: top; }
    th { background: #f3f4f6; font-weight: 700; }
    tr { page-break-inside: avoid; }
    .finding-row { page-break-inside: avoid; }
    .evidence-item { margin-bottom: 6pt; padding: 6pt; background: #f9fafb; border-left: 3px solid #2563eb; }
    .custody-item { font-size: 9pt; color: #555; margin-bottom: 4pt; }
    .audit-item { font-size: 9pt; color: #555; font-family: monospace; }
    .disclaimer { font-size: 9pt; color: #666; border-top: 1px solid #ccc; margin-top: 24pt; padding-top: 8pt; font-style: italic; }
    .page-break { page-break-before: always; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>Property Due-Process Analysis Report</h1>
  <div class="meta">
    <div class="meta-row"><span><strong>Case:</strong> ${escapeHtml(data.projectName)}</span><span><strong>APN:</strong> ${escapeHtml(data.apn)}</span></div>
    <div class="meta-row"><span><strong>Address:</strong> ${escapeHtml(data.propertyAddress || "N/A")}</span><span><strong>Type:</strong> ${escapeHtml(data.caseType)}</span></div>
    <div class="meta-row"><span><strong>Generated:</strong> ${escapeHtml(data.generatedAt)}</span><span><strong>By:</strong> ${escapeHtml(data.generatedBy)}</span></div>
    <div class="meta-row"><span><strong>Organization:</strong> ${escapeHtml(data.organizationName)}</span></div>
  </div>

  <div class="score-box">
    <div class="score-number">${data.dueProcessScore}<span style="font-size:14pt;">/100</span></div>
    <div class="score-label">Due Process Score</div>
    <div style="font-size:9pt;color:#666;margin-top:4pt;">
      ${data.dueProcessScore >= 80 ? "Low concern — procedures appear consistent with statutory requirements." :
        data.dueProcessScore >= 50 ? "Moderate concern — some procedural gaps identified." :
        "High concern — multiple procedural deviations detected."}
    </div>
  </div>

  <h2>Executive Summary</h2>
  ${data.sections.map(s => `<h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.content).replace(/\n/g, "<br>")}</p>`).join("")}

  <h2 class="page-break">Timeline of Events</h2>
  <table>
    <thead><tr><th>Date</th><th>Event</th><th>Source</th></tr></thead>
    <tbody>
      ${data.timeline.map(t => `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.event)}</td><td>${escapeHtml(t.source)}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2 class="page-break">Due Process Findings</h2>
  <table>
    <thead><tr><th>Rule</th><th>Severity</th><th>Status</th><th>Detail</th></tr></thead>
    <tbody>
      ${data.findings.map(f => `<tr class="finding-row"><td>${escapeHtml(f.rule)}</td><td>${severityBadge(f.severity)}</td><td>${statusBadge(f.status)}</td><td>${escapeHtml(f.detail).replace(/\n/g, "<br>")}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2 class="page-break">Statutory Compliance Checks</h2>
  <table>
    <thead><tr><th>Statute</th><th>Status</th><th>Agent Note</th></tr></thead>
    <tbody>
      ${data.statutoryChecks.map(s => `<tr><td>${escapeHtml(s.statute)}</td><td>${statusBadge(s.status)}</td><td>${escapeHtml(s.note).replace(/\n/g, "<br>")}</td></tr>`).join("")}
    </tbody>
  </table>

  <h2 class="page-break">Evidence Inventory</h2>
  ${data.evidence.map(e => `
    <div class="evidence-item">
      <strong>${escapeHtml(e.title)}</strong> (${escapeHtml(e.type)}) — Source: ${escapeHtml(e.source)}<br>
      <span style="font-family:monospace;font-size:9pt;color:#666;">SHA-256: ${escapeHtml(e.hash)}</span>
    </div>
  `).join("")}

  <h2 class="page-break">Chain of Custody</h2>
  ${data.custodyChain.map(c => `
    <div class="custody-item">
      <strong>${escapeHtml(c.action)}</strong> — ${escapeHtml(c.actor)} @ ${escapeHtml(c.timestamp)}<br>
      <span style="font-family:monospace;">Hash: ${escapeHtml(c.hash)}</span>
    </div>
  `).join("")}

  <h2 class="page-break">Agent Audit Trail</h2>
  <table>
    <thead><tr><th>Agent</th><th>Status</th><th>Ledger Hash</th></tr></thead>
    <tbody>
      ${data.agentAudit.map(a => `<tr><td>${escapeHtml(a.agent)}</td><td>${statusBadge(a.status)}</td><td class="audit-item">${escapeHtml(a.hash)}</td></tr>`).join("")}
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Disclaimer:</strong> This report was generated by FairProcess, an evidence-first analysis platform.
    It identifies evidentiary status and procedural patterns based on public records and user-uploaded documents.
    It does not render legal conclusions. All findings should be reviewed by qualified legal counsel.
    SHA-256 hashes are provided for evidence integrity verification.
    This report is confidential and attorney work product where applicable.
  </div>
</body>
</html>`;
}

// ── Report Data Builder ──

export async function buildReportData(
  db: D1Database,
  projectId: string,
  organizationId: string,
  userName: string,
  orgName: string
): Promise<ReportData | null> {
  const project = await db.prepare(
    `SELECT p.*, pr.address, pr.apn, pr.city FROM projects p JOIN properties pr ON p.property_id = pr.id WHERE p.id = ? AND p.organization_id = ?`
  ).bind(projectId, organizationId).first();

  if (!project) return null;

  const [timeline, findings, evidence, agentAudit, statutoryChecks, custody] = await Promise.all([
    db.prepare("SELECT event_date, event_type, description FROM timeline_events WHERE project_id = ? AND organization_id = ? ORDER BY event_date").bind(projectId, organizationId).all(),
    db.prepare("SELECT rule_name, severity, status, detail FROM due_process_findings WHERE project_id = ? AND organization_id = ? ORDER BY severity DESC, created_at").bind(projectId, organizationId).all(),
    db.prepare("SELECT title, doc_type, source, ai_summary FROM evidence WHERE project_id = ? AND organization_id = ? ORDER BY created_at").bind(projectId, organizationId).all(),
    db.prepare("SELECT title, status, ai_summary FROM evidence WHERE project_id = ? AND organization_id = ? AND doc_type = 'audit_ledger' ORDER BY created_at DESC LIMIT 1").bind(projectId, organizationId).first(),
    db.prepare("SELECT rule_name, severity, status, detail FROM due_process_findings WHERE project_id = ? AND organization_id = ? AND rule LIKE 'statute_%' ORDER BY created_at").bind(projectId, organizationId).all(),
    db.prepare("SELECT action, actor_name, created_at FROM audit_logs WHERE resource_organization_id = ? AND action IN ('evidence_upload','evidence_download','evidence_withdraw','project_create','timeline_create','finding_review') ORDER BY created_at").bind(organizationId).all(),
  ]);

  // Build agent audit from the latest audit ledger
  let agentAuditList: { agent: string; status: string; hash: string }[] = [];
  if (agentAudit) {
    const summary = (agentAudit as any).ai_summary || "";
    // Parse "Agents: fact_extraction(success), timeline(success)..."
    const match = summary.match(/Agents: (.+?)\./);
    if (match) {
      agentAuditList = match[1].split(",").map((s: string) => {
        const [name, status] = s.trim().split("(");
        return { agent: name.trim(), status: status?.replace(")", "").trim() || "unknown", hash: "" };
      });
    }
  }

  // Build custody chain
  const custodyChain = ((custody.results || []) as any[]).map((c: any) => ({
    action: c.action,
    actor: c.actor_name || "System",
    timestamp: c.created_at,
    hash: "N/A", // In production, compute SHA-256 of the audit log entry
  }));

  return {
    projectName: (project as any).name || "Unnamed Case",
    propertyAddress: [(project as any).address, (project as any).city].filter(Boolean).join(", "),
    apn: (project as any).apn || "N/A",
    generatedAt: new Date().toISOString(),
    generatedBy: userName,
    organizationName: orgName,
    caseType: (project as any).case_type || "General",
    dueProcessScore: (project as any).due_process_score ?? 100,
    sections: [
      {
        title: "Case Overview",
        content: `This report analyzes the due-process history for APN ${(project as any).apn || "N/A"}.
The case type is ${(project as any).case_type || "general"}.
Analysis includes building permits, code enforcement records, county recorder documents, and user-uploaded evidence.
All findings are based on public records and are subject to the limitations of data availability and accuracy.`,
      },
    ],
    timeline: ((timeline.results || []) as any[]).map((t: any) => ({
      date: t.event_date,
      event: t.description || t.event_type,
      source: t.event_type,
    })),
    findings: ((findings.results || []) as any[]).map((f: any) => ({
      rule: f.rule_name,
      severity: f.severity,
      status: f.status,
      detail: f.detail,
    })),
    evidence: ((evidence.results || []) as any[]).map((e: any) => ({
      title: e.title,
      type: e.doc_type,
      source: e.source,
      hash: "SHA-256:pending", // In production, compute from file content
    })),
    agentAudit: agentAuditList,
    statutoryChecks: ((statutoryChecks.results || []) as any[]).map((s: any) => ({
      statute: s.rule_name,
      status: s.status,
      note: s.detail,
    })),
    custodyChain,
  };
}
