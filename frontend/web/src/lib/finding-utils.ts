/**
 * Shared finding utilities — used by all three analysis engines
 * (auto-triggers, recon-agents-records, analysis-agents) to ensure
 * consistent fingerprint-based upsert behavior.
 *
 * This prevents the "three engines fighting over one table" problem
 * by giving them all the same non-destructive write pattern.
 */

/**
 * Generate a stable fingerprint for a finding.
 * Same rule + same evidence + same detail = same fingerprint.
 * Used for upsert: if fingerprint matches, preserve existing status/reviews.
 */
export function findingFingerprint(
  ruleOrFinding: string | { project_id?: string; rule: string; evidence_id?: string | null; detail?: string | null },
  evidenceId?: string | null,
  detail?: string,
): string {
  // Accept both call patterns:
  //   findingFingerprint({ project_id, rule, evidence_id, detail })  — object form
  //   findingFingerprint(rule, evidenceId, detail)                  — args form
  let projectId: string | undefined;
  let rule: string;
  let evId: string | null;
  let det: string;

  if (typeof ruleOrFinding === "object" && ruleOrFinding !== null) {
    projectId = ruleOrFinding.project_id;
    rule = ruleOrFinding.rule;
    evId = ruleOrFinding.evidence_id ?? null;
    det = ruleOrFinding.detail ?? "";
  } else {
    rule = ruleOrFinding as string;
    evId = evidenceId ?? null;
    det = detail ?? "";
  }

  // Readable fingerprint format: project_id:rule:evidenceId:detail (truncated)
  const pid = projectId ?? "none";
  const eid = evId ?? "none";
  const detSlug = det.slice(0, 100) || "none";
  return `${pid}:${rule}:${eid}:${detSlug}`;
}

export interface FindingInput {
  rule: string;
  rule_name: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  evidence_id?: string | null;
  missing_info?: boolean;
}

export interface UpsertResult {
  inserted: number;
  preserved: number;
  superseded: number;
}

/**
 * Fingerprint-based upsert for due_process_findings.
 *
 * - Existing findings with matching fingerprint keep their status/reviews.
 * - New findings are inserted with 'open' status.
 * - Findings that no longer apply are marked 'superseded' (not deleted).
 * - Only touches findings whose rule is in the provided rulePrefix set.
 *
 * @param db - D1 database
 * @param projectId - Project ID
 * @param orgId - Organization ID
 * @param newFindings - Array of findings to upsert
 * @param ruleScope - Array of rule prefixes to scope the operation to (e.g. ['statute_', 'discrepancy_'])
 *                    Use ['*'] to operate on all non-superseded findings.
 */
export async function fingerprintUpsertFindings(
  db: D1Database,
  projectId: string,
  orgId: string,
  newFindings: FindingInput[],
  ruleScope: string[],
): Promise<UpsertResult> {
  // Generate fingerprints for new findings
  const newFingerprints = new Set(
    newFindings.map(f => findingFingerprint(f.rule, f.evidence_id ?? null, f.detail ?? ""))
  );

  // Build the scope filter
  let scopeFilter: string;
  let scopeParams: any[];
  if (ruleScope.includes("*")) {
    scopeFilter = "status != 'superseded'";
    scopeParams = [];
  } else {
    const orClauses = ruleScope.map(prefix =>
      `rule LIKE ? OR rule = ?`
    ).join(" OR ");
    // For each prefix, we need both LIKE 'prefix%' and exact match
    const scopeValues: string[] = [];
    for (const prefix of ruleScope) {
      scopeValues.push(`${prefix}%`);
      scopeValues.push(prefix);
    }
    scopeFilter = `status != 'superseded' AND (${ruleScope.map(() => "rule LIKE ?").join(" OR ")})`;
    scopeParams = scopeValues.slice(0, ruleScope.length); // just the LIKE patterns
  }

  // Fetch existing findings in scope
  const existingResult = await db
    .prepare(
      `SELECT id, finding_fingerprint, status, reviewed_by, reviewed_at, rule
       FROM due_process_findings
       WHERE project_id = ? AND organization_id = ? AND ${scopeFilter}`
    )
    .bind(projectId, orgId, ...scopeParams)
    .all();
  const existingFindings = existingResult.results ?? [];

  const existingByFingerprint = new Map(
    existingFindings.map((ef: any) => [ef.finding_fingerprint, ef])
  );

  // Categorize: preserve, insert, supersede
  const toInsert: any[] = [];
  const toSupersede: string[] = [];
  let preserved = 0;

  for (const finding of newFindings) {
    const fp = findingFingerprint(finding.rule, finding.evidence_id ?? null, finding.detail ?? "");
    const existing = existingByFingerprint.get(fp);
    if (existing) {
      // Finding already exists — preserve status, reviewed_by, reviewed_at
      preserved++;
      existingByFingerprint.delete(fp);
    } else {
      // New finding — insert
      toInsert.push({
        id: crypto.randomUUID(),
        project_id: projectId,
        org_id: orgId,
        rule: finding.rule,
        rule_name: finding.rule_name,
        severity: finding.severity,
        detail: finding.detail,
        evidence_id: finding.evidence_id ?? null,
        missing_info: finding.missing_info ? 1 : 0,
        fingerprint: fp,
      });
    }
  }

  // Remaining in existingByFingerprint are stale → mark superseded
  for (const [_fp, ef] of existingByFingerprint) {
    toSupersede.push((ef as any).id);
  }

  // Insert new findings
  if (toInsert.length > 0) {
    const insertStmts = toInsert.map(f =>
      db.prepare(
        `INSERT INTO due_process_findings
          (id, project_id, rule, rule_name, severity, status, detail, evidence_id, missing_info, finding_fingerprint, organization_id)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
      ).bind(f.id, f.project_id, f.rule, f.rule_name, f.severity, f.detail, f.evidence_id, f.missing_info, f.fingerprint, f.org_id)
    );
    await db.batch(insertStmts);
  }

  // Mark stale findings as superseded
  if (toSupersede.length > 0) {
    const supersedeStmts = toSupersede.map(id =>
      db.prepare("UPDATE due_process_findings SET status = 'superseded' WHERE id = ?")
        .bind(id)
    );
    await db.batch(supersedeStmts);
  }

  return {
    inserted: toInsert.length,
    preserved,
    superseded: toSupersede.length,
  };
}
