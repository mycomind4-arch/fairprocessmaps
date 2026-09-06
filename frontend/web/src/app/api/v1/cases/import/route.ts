import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unzipSync, strFromU8 } from "fflate";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import { safeR2Key, sanitizeFilename } from "@/lib/security/evidence";
import { normalizeApn } from "@/lib/vision/case-builder";
import {
  CASE_FILE_FORMAT_VERSION,
  MAX_CASE_FILE_BYTES,
  type CaseFileManifest,
} from "@/lib/case-export/manifest";

export const runtime = "nodejs";

/**
 * POST /api/v1/cases/import
 *
 * Reopens a case file produced by GET /api/v1/cases/[id]/export. Rebuilds
 * every row under a brand-new set of IDs, scoped entirely to the importing
 * user's own organization — nothing in the uploaded file is trusted for
 * *which* organization the data belongs to or *what* its IDs are:
 *
 *   - organization_id on every inserted row is the importing user's org,
 *     never whatever the file claims.
 *   - Every ID is regenerated here; the file's IDs are only used to
 *     rewire foreign keys (evidence -> timeline event, run -> stage
 *     result, etc.) within this one import.
 *   - Workflow authorizations import as history only (see
 *     lib/case-export/manifest.ts) — they can never satisfy a live
 *     authorization check in the new copy.
 *
 * A case can be imported more than once (e.g. to compare two points in
 * time); each import produces an entirely separate case, never a merge
 * into an existing one.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "case.update");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const bucket = env.EVIDENCE_BUCKET;
    const orgId = user.organization_id;

    const rl = await checkRateLimit(req, "case_import", 5, 60, env);
    if (!rl.ok) return rl.response!;

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { error: "A .fpcase.zip file is required (field name 'file')" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (file.size > MAX_CASE_FILE_BYTES) {
      return NextResponse.json(
        { error: `Case file exceeds maximum size of ${MAX_CASE_FILE_BYTES / 1024 / 1024} MB` },
        { status: 413, headers: { "Cache-Control": "no-store" } },
      );
    }

    let zipEntries: Record<string, Uint8Array>;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      zipEntries = unzipSync(bytes);
    } catch {
      return NextResponse.json(
        { error: "Could not read the uploaded file as a case file (.fpcase.zip)" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    const manifestBytes = zipEntries["manifest.json"];
    if (!manifestBytes) {
      return NextResponse.json(
        { error: "This zip does not contain a manifest.json — not a valid case file" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    let manifest: CaseFileManifest;
    try {
      manifest = JSON.parse(strFromU8(manifestBytes));
    } catch {
      return NextResponse.json(
        { error: "manifest.json is not valid JSON" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (manifest.formatVersion !== CASE_FILE_FORMAT_VERSION) {
      return NextResponse.json(
        {
          error: `This case file was made with format v${manifest.formatVersion}, this build reads v${CASE_FILE_FORMAT_VERSION}`,
        },
        { status: 422, headers: { "Cache-Control": "no-store" } },
      );
    }

    const now = new Date().toISOString();
    const actor = humanActor(user);

    // ── Property: reuse an existing one with the same APN, else create ──
    let propertyId: string | null = null;
    if (manifest.property) {
      const apnNorm = manifest.property.apn ? normalizeApn(manifest.property.apn) : "";
      const existing = apnNorm
        ? await db
            .prepare(`SELECT id, apn FROM properties`)
            .all()
            .then((r) =>
              ((r.results ?? []) as { id: string; apn: string | null }[]).find(
                (p) => p.apn && normalizeApn(p.apn) === apnNorm,
              ),
            )
        : undefined;

      if (existing) {
        propertyId = existing.id;
      } else {
        propertyId = crypto.randomUUID();
        const p = manifest.property;
        await db
          .prepare(
            `INSERT INTO properties
              (id, apn, address, city, county, zoning, acres, legal_desc,
               centroid_lng, centroid_lat, geom_geojson, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            propertyId, p.apn, p.address, p.city, p.county, p.zoning, p.acres,
            p.legal_desc, p.centroid_lng, p.centroid_lat, p.geom_geojson, now, now,
          )
          .run();
      }
    }

    // ── Project (and matching legacy `cases` row, same id — established
    // pattern for cases built this way) ──────────────────────────────────
    const newCaseId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO projects
          (id, property_id, name, case_type, department, status,
           due_process_score, opened_at, closed_at, updated_at, organization_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        newCaseId, propertyId, manifest.project.name, manifest.project.case_type,
        manifest.project.department, manifest.project.status ?? "open",
        manifest.project.due_process_score, manifest.project.opened_at ?? now,
        manifest.project.closed_at, now, orgId,
      )
      .run();

    if (manifest.legacyCase) {
      await db
        .prepare(
          `INSERT INTO cases
            (id, organization_id, name, case_number, case_type, status, priority,
             description, assigned_to, due_date, opened_at, closed_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        )
        .bind(
          newCaseId, orgId, manifest.legacyCase.name, manifest.legacyCase.case_number,
          manifest.legacyCase.case_type, manifest.legacyCase.status ?? "open",
          manifest.legacyCase.priority, manifest.legacyCase.description,
          manifest.legacyCase.due_date, manifest.legacyCase.opened_at ?? now,
          manifest.legacyCase.closed_at, now,
        )
        .run();
      await db
        .prepare(
          `INSERT INTO case_projects (id, case_id, project_id, role, linked_at)
           VALUES (?, ?, ?, 'primary', ?)`,
        )
        .bind(crypto.randomUUID(), newCaseId, newCaseId, now)
        .run();
    }

    // ── Evidence: new IDs, files re-uploaded to this org's R2 prefix ────
    const evidenceIdMap = new Map<string, string>();
    for (const ev of manifest.evidence) {
      const newId = crypto.randomUUID();
      evidenceIdMap.set(ev.id, newId);

      let r2Key: string | null = null;
      if (ev.filePath && zipEntries[ev.filePath] && bucket) {
        const bytes = zipEntries[ev.filePath];
        const safeName = sanitizeFilename(ev.original_filename ?? "file");
        r2Key = safeR2Key(orgId, newId, safeName);
        await bucket.put(r2Key, bytes, {
          httpMetadata: { contentType: ev.content_type ?? "application/octet-stream" },
        });
      }

      // Recompute the hash from the actual bytes rather than trusting the
      // manifest's claimed sha256 — the file is the source of truth.
      let sha256Hash = ev.sha256_hash;
      if (ev.filePath && zipEntries[ev.filePath]) {
        const bytesForHash = zipEntries[ev.filePath];
        const digest = await crypto.subtle.digest("SHA-256", bytesForHash.buffer.slice(bytesForHash.byteOffset, bytesForHash.byteOffset + bytesForHash.byteLength) as ArrayBuffer);
        sha256Hash = Array.from(new Uint8Array(digest))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      await db
        .prepare(
          `INSERT INTO evidence
            (id, project_id, source, doc_type, title, status, extracted_text,
             ai_summary, r2_key, organization_id, uploaded_by, sha256_hash,
             content_type, original_filename, uploaded_at, created_at,
             withdrawn, withdrawn_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newId, newCaseId, ev.source, ev.doc_type, ev.title, ev.status,
          ev.extracted_text, ev.ai_summary, r2Key, orgId, user.id, sha256Hash,
          ev.content_type, ev.original_filename, ev.uploaded_at ?? now, now,
          ev.withdrawn ?? 0, ev.withdrawn_at,
        )
        .run();
    }

    // ── Timeline events ───────────────────────────────────────────────────
    for (const te of manifest.timelineEvents) {
      await db
        .prepare(
          `INSERT INTO timeline_events
            (id, project_id, evidence_id, event_date, event_type, description,
             organization_id, actor_type, actor_id, actor_organization_id,
             resource_organization_id, agent_version, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newCaseId,
          te.evidenceId ? evidenceIdMap.get(te.evidenceId) ?? null : null,
          te.event_date, te.event_type, te.description, orgId,
          te.actor_type, te.actor_id, orgId, orgId, te.agent_version,
          te.created_at ?? now,
        )
        .run();
    }

    // ── Findings ──────────────────────────────────────────────────────────
    for (const f of manifest.findings) {
      await db
        .prepare(
          `INSERT INTO due_process_findings
            (id, project_id, rule, rule_name, severity, status, detail,
             evidence_id, missing_info, organization_id, jurisdiction_id,
             finding_fingerprint, reviewed_by, reviewed_at, generated_by_agent,
             agent_version, rule_status, citation, source_url, authority,
             policy_pack, policy_version, provisional, recommended_action,
             created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newCaseId, f.rule, f.rule_name, f.severity,
          f.status, f.detail, f.evidenceId ? evidenceIdMap.get(f.evidenceId) ?? null : null,
          f.missing_info, orgId, f.jurisdiction_id, f.finding_fingerprint,
          f.reviewed_by, f.reviewed_at, f.generated_by_agent, f.agent_version,
          f.rule_status, f.citation, f.source_url, f.authority, f.policy_pack,
          f.policy_version, f.provisional, f.recommended_action, f.created_at ?? now,
        )
        .run();
    }

    // ── Workflow runs, stage results, authorizations (history-only), mailings ──
    const runIdMap = new Map<string, string>();
    for (const run of manifest.workflowRuns) {
      const newRunId = crypto.randomUUID();
      runIdMap.set(run.id, newRunId);
      await db
        .prepare(
          `INSERT INTO workflow_runs
            (id, workflow_id, case_id, organization_id, status, current_stage,
             source_evidence_id, notice_type, service_date, response_due_date,
             deadline_confidence, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newRunId, run.workflow_id, newCaseId, orgId, run.status, run.current_stage,
          run.sourceEvidenceId ? evidenceIdMap.get(run.sourceEvidenceId) ?? null : null,
          run.notice_type, run.service_date, run.response_due_date,
          run.deadline_confidence, run.created_by, run.created_at ?? now, now,
        )
        .run();
    }

    const authIdMap = new Map<string, string>();
    for (const a of manifest.workflowAuthorizations) {
      const newAuthId = crypto.randomUUID();
      authIdMap.set(a.id, newAuthId);
      const newRunId = runIdMap.get(a.runId);
      if (!newRunId) continue;
      // superseded_at is set immediately on import: this attestation
      // authorized a specific human's review of a specific letter in the
      // *source* case, not this new copy. It is kept for history only and
      // must never satisfy the engine's live authorization check here.
      await db
        .prepare(
          `INSERT INTO workflow_authorizations
            (id, run_id, organization_id, stage_id, authorized_by, authorized_at,
             content_hash, attestation, superseded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          newAuthId, newRunId, orgId, a.stage_id, a.authorized_by, a.authorized_at,
          a.content_hash, a.attestation, now,
        )
        .run();
    }

    for (const stage of manifest.workflowStageResults) {
      const newRunId = runIdMap.get(stage.runId);
      if (!newRunId) continue;
      await db
        .prepare(
          `INSERT INTO workflow_stage_results
            (id, run_id, organization_id, stage_id, status, summary, output,
             blocked_reason, next_action, started_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newRunId, orgId, stage.stage_id, stage.status,
          stage.summary, stage.output, stage.blocked_reason, stage.next_action,
          stage.started_at, stage.completed_at,
        )
        .run();
    }

    for (const m of manifest.workflowMailings) {
      const newRunId = runIdMap.get(m.runId);
      if (!newRunId) continue;
      await db
        .prepare(
          `INSERT INTO workflow_mailings
            (id, run_id, organization_id, authorization_id, provider, provider_job_id,
             mail_class, idempotency_key, tracking_number, expected_delivery_date,
             proof_url, delivered_at, last_status, proof_evidence_id, error_code,
             error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newRunId, orgId,
          m.authorizationId ? authIdMap.get(m.authorizationId) ?? null : null,
          m.provider, m.provider_job_id, m.mail_class,
          `imported-${crypto.randomUUID()}`, m.tracking_number,
          m.expected_delivery_date, m.proof_url, m.delivered_at, m.last_status,
          m.proofEvidenceId ? evidenceIdMap.get(m.proofEvidenceId) ?? null : null,
          m.error_code, m.error_message, m.created_at ?? now, now,
        )
        .run();
    }

    // ── Response drafts & case communications ────────────────────────────
    for (const d of manifest.responseDrafts) {
      await db
        .prepare(
          `INSERT INTO response_drafts
            (id, case_id, organization_id, title, recipient_name, recipient_company,
             recipient_address1, recipient_address2, recipient_city, recipient_state,
             recipient_postal_code, recipient_country, subject, body, status,
             created_by, created_at, updated_at, finalized_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newCaseId, orgId, d.title, d.recipient_name,
          d.recipient_company, d.recipient_address1, d.recipient_address2,
          d.recipient_city, d.recipient_state, d.recipient_postal_code,
          d.recipient_country, d.subject, d.body, d.status, d.created_by,
          d.created_at ?? now, now, d.finalized_at,
        )
        .run();
    }

    for (const c of manifest.caseCommunications) {
      await db
        .prepare(
          `INSERT INTO case_communications
            (id, case_id, organization_id, purpose, status, mail_class,
             source_document_id, provider, provider_job_id, idempotency_key,
             recipient_name, recipient_company, recipient_address1,
             recipient_address2, recipient_city, recipient_state,
             recipient_postal_code, recipient_country, matter_reference,
             metadata, tracking_number, proof_url, error_code, error_message,
             created_at, submitted_at, accepted_at, delivered_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(), newCaseId, orgId, c.purpose, c.status, c.mail_class,
          c.sourceDocumentId ? evidenceIdMap.get(c.sourceDocumentId) ?? null : null,
          c.provider, c.provider_job_id, `imported-${crypto.randomUUID()}`,
          c.recipient_name, c.recipient_company, c.recipient_address1,
          c.recipient_address2, c.recipient_city, c.recipient_state,
          c.recipient_postal_code, c.recipient_country, c.matter_reference,
          c.metadata, c.tracking_number, c.proof_url, c.error_code,
          c.error_message, c.created_at ?? now, c.submitted_at, c.accepted_at,
          c.delivered_at, now,
        )
        .run();
    }

    if (manifest.projectSettingsJson) {
      await db
        .prepare(
          `INSERT INTO project_settings (project_id, organization_id, settings_json, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(newCaseId, orgId, manifest.projectSettingsJson, now)
        .run();
    }

    await emitAuditEvent({
      db,
      actor,
      action: "case.import",
      resourceType: "project",
      resourceId: newCaseId,
      detail: `Imported case file exported ${manifest.exportedAt} by ${manifest.exportedBy} as '${manifest.sourceCaseName}' (${manifest.evidence.length} evidence records)`,
    });

    return NextResponse.json(
      { ok: true, projectId: newCaseId, name: manifest.project.name },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
