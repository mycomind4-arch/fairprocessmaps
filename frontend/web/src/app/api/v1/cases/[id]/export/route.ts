import { NextRequest, NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { zipSync, strToU8 } from "fflate";
import { requireAuth } from "@/lib/security/middleware";
import { authorize } from "@/lib/security/authorization";
import { checkRateLimit } from "@/lib/rate-limit";
import { humanActor, emitAuditEvent } from "@/lib/security/events";
import {
  CASE_FILE_FORMAT_VERSION,
  type CaseFileManifest,
  type EvidenceRecord,
} from "@/lib/case-export/manifest";

export const runtime = "nodejs";

/**
 * GET /api/v1/cases/[id]/export
 *
 * Packages one case — property, project, timeline, findings, workflow
 * state, response drafts, and the evidence files themselves — into a
 * single downloadable .zip.
 *
 * Every query below is scoped to the caller's organization_id. `id` is
 * accepted as either a `projects.id` or the matching `cases.id` (the two
 * surfaces share the same identifier for every case built this way); a
 * request naming a case in a different organization gets a 404, not a
 * peek at whether it exists.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const user = auth.user;

    const authz = authorize(user, "case.read");
    if (!authz.allowed) {
      return NextResponse.json(
        { error: authz.reason ?? "Insufficient permissions" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }

    const { env } = getCloudflareContext();
    const db = env.DB;
    const orgId = user.organization_id;

    const rl = await checkRateLimit(req, "case_export", 10, 60, env);
    if (!rl.ok) return rl.response!;

    const project = await db
      .prepare(
        `SELECT id, name, case_type, department, status, due_process_score,
                opened_at, closed_at, property_id
           FROM projects WHERE id = ? AND organization_id = ?`,
      )
      .bind(id, orgId)
      .first<Record<string, unknown>>();

    if (!project) {
      return NextResponse.json(
        { error: "Case not found" },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }

    const property = project.property_id
      ? await db
          .prepare(
            `SELECT id, apn, address, city, county, zoning, acres, legal_desc,
                    centroid_lng, centroid_lat, geom_geojson
               FROM properties WHERE id = ?`,
          )
          .bind(project.property_id)
          .first<Record<string, unknown>>()
      : null;

    const legacyCase = await db
      .prepare(
        `SELECT id, name, case_number, case_type, status, priority,
                description, due_date, opened_at, closed_at
           FROM cases WHERE id = ? AND organization_id = ?`,
      )
      .bind(id, orgId)
      .first<Record<string, unknown>>();

    const evidenceRows = await db
      .prepare(
        `SELECT id, source, doc_type, title, status, extracted_text, ai_summary,
                r2_key, content_type, original_filename, sha256_hash,
                uploaded_by, uploaded_at, withdrawn, withdrawn_at
           FROM evidence WHERE project_id = ? AND organization_id = ?
          ORDER BY created_at ASC`,
      )
      .bind(id, orgId)
      .all();

    const timelineRows = await db
      .prepare(
        `SELECT id, evidence_id, event_date, event_type, description,
                actor_type, actor_id, agent_version, created_at
           FROM timeline_events WHERE project_id = ? AND organization_id = ?
          ORDER BY created_at ASC`,
      )
      .bind(id, orgId)
      .all();

    const findingRows = await db
      .prepare(
        `SELECT id, rule, rule_name, severity, status, detail, evidence_id,
                missing_info, jurisdiction_id, finding_fingerprint,
                reviewed_by, reviewed_at, generated_by_agent, agent_version,
                rule_status, citation, source_url, authority, policy_pack,
                policy_version, provisional, recommended_action, created_at
           FROM due_process_findings WHERE project_id = ? AND organization_id = ?
          ORDER BY created_at ASC`,
      )
      .bind(id, orgId)
      .all();

    // Workflow surfaces key off cases.id — only present when this case has
    // one (see the known projects/cases gap noted in code comments below).
    const runRows = legacyCase
      ? await db
          .prepare(
            `SELECT id, workflow_id, status, current_stage, source_evidence_id,
                    notice_type, service_date, response_due_date,
                    deadline_confidence, created_by, created_at, updated_at
               FROM workflow_runs WHERE case_id = ? AND organization_id = ?`,
          )
          .bind(id, orgId)
          .all()
      : { results: [] };

    const runIds = ((runRows.results ?? []) as Record<string, unknown>[]).map((r) => r.id as string);

    const stageRows = runIds.length
      ? await db
          .prepare(
            `SELECT id, run_id, organization_id, stage_id, status, summary, output,
                    blocked_reason, next_action, started_at, completed_at
               FROM workflow_stage_results
              WHERE organization_id = ? AND run_id IN (${runIds.map(() => "?").join(",")})`,
          )
          .bind(orgId, ...runIds)
          .all()
      : { results: [] };

    const authRows = runIds.length
      ? await db
          .prepare(
            `SELECT id, run_id, stage_id, authorized_by, authorized_at,
                    content_hash, attestation
               FROM workflow_authorizations
              WHERE organization_id = ? AND run_id IN (${runIds.map(() => "?").join(",")})`,
          )
          .bind(orgId, ...runIds)
          .all()
      : { results: [] };

    const mailingRows = runIds.length
      ? await db
          .prepare(
            `SELECT id, run_id, authorization_id, provider, provider_job_id, mail_class,
                    tracking_number, expected_delivery_date, proof_url, delivered_at,
                    last_status, proof_evidence_id, error_code, error_message, created_at
               FROM workflow_mailings
              WHERE organization_id = ? AND run_id IN (${runIds.map(() => "?").join(",")})`,
          )
          .bind(orgId, ...runIds)
          .all()
      : { results: [] };

    const draftRows = legacyCase
      ? await db
          .prepare(
            `SELECT id, title, recipient_name, recipient_company, recipient_address1,
                    recipient_address2, recipient_city, recipient_state,
                    recipient_postal_code, recipient_country, subject, body, status,
                    created_by, created_at, finalized_at
               FROM response_drafts WHERE case_id = ? AND organization_id = ?`,
          )
          .bind(id, orgId)
          .all()
      : { results: [] };

    const commRows = legacyCase
      ? await db
          .prepare(
            `SELECT id, purpose, status, mail_class, source_document_id, provider,
                    provider_job_id, recipient_name, recipient_company,
                    recipient_address1, recipient_address2, recipient_city,
                    recipient_state, recipient_postal_code, recipient_country,
                    matter_reference, metadata, tracking_number, proof_url,
                    error_code, error_message, created_at, submitted_at,
                    accepted_at, delivered_at
               FROM case_communications WHERE case_id = ? AND organization_id = ?`,
          )
          .bind(id, orgId)
          .all()
      : { results: [] };

    const settingsRow = await db
      .prepare(`SELECT settings_json FROM project_settings WHERE project_id = ? AND organization_id = ?`)
      .bind(id, orgId)
      .first<{ settings_json: string }>();

    // ── Pull evidence blobs from R2, alongside the manifest rows ──────────
    const bucket = env.EVIDENCE_BUCKET;
    const files: Record<string, Uint8Array> = {};
    const evidence: EvidenceRecord[] = [];

    for (const row of (evidenceRows.results ?? []) as Record<string, unknown>[]) {
      let filePath: string | null = null;
      const r2Key = row.r2_key as string | null;
      if (r2Key && bucket) {
        const obj = await bucket.get(r2Key);
        if (obj) {
          const safeName = (row.original_filename as string | null) ?? "file";
          filePath = `files/${row.id}-${safeName.replace(/[^\w.\- ]/g, "_")}`;
          files[filePath] = new Uint8Array(await obj.arrayBuffer());
        }
      }
      evidence.push({
        id: row.id as string,
        source: (row.source as string) ?? null,
        doc_type: (row.doc_type as string) ?? null,
        title: (row.title as string) ?? null,
        status: (row.status as string) ?? null,
        extracted_text: (row.extracted_text as string) ?? null,
        ai_summary: (row.ai_summary as string) ?? null,
        content_type: (row.content_type as string) ?? null,
        original_filename: (row.original_filename as string) ?? null,
        sha256_hash: (row.sha256_hash as string) ?? null,
        uploaded_by: (row.uploaded_by as string) ?? null,
        uploaded_at: (row.uploaded_at as string) ?? null,
        withdrawn: (row.withdrawn as number) ?? null,
        withdrawn_at: (row.withdrawn_at as string) ?? null,
        filePath,
      });
    }

    const manifest: CaseFileManifest = {
      formatVersion: CASE_FILE_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      sourceCaseId: id,
      sourceCaseName: (project.name as string) ?? "Untitled case",

      property: property
        ? {
            id: property.id as string,
            apn: (property.apn as string) ?? null,
            address: (property.address as string) ?? null,
            city: (property.city as string) ?? null,
            county: (property.county as string) ?? null,
            zoning: (property.zoning as string) ?? null,
            acres: (property.acres as number) ?? null,
            legal_desc: (property.legal_desc as string) ?? null,
            centroid_lng: (property.centroid_lng as number) ?? null,
            centroid_lat: (property.centroid_lat as number) ?? null,
            geom_geojson: (property.geom_geojson as string) ?? null,
          }
        : null,

      project: {
        id: project.id as string,
        name: project.name as string,
        case_type: (project.case_type as string) ?? null,
        department: (project.department as string) ?? null,
        status: (project.status as string) ?? null,
        due_process_score: (project.due_process_score as number) ?? null,
        opened_at: (project.opened_at as string) ?? null,
        closed_at: (project.closed_at as string) ?? null,
      },

      legacyCase: legacyCase
        ? {
            id: legacyCase.id as string,
            name: legacyCase.name as string,
            case_number: (legacyCase.case_number as string) ?? null,
            case_type: (legacyCase.case_type as string) ?? null,
            status: (legacyCase.status as string) ?? null,
            priority: (legacyCase.priority as string) ?? null,
            description: (legacyCase.description as string) ?? null,
            due_date: (legacyCase.due_date as string) ?? null,
            opened_at: (legacyCase.opened_at as string) ?? null,
            closed_at: (legacyCase.closed_at as string) ?? null,
          }
        : null,

      evidence,

      timelineEvents: ((timelineRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        evidenceId: (r.evidence_id as string) ?? null,
        event_date: (r.event_date as string) ?? null,
        event_type: r.event_type as string,
        description: r.description as string,
        actor_type: (r.actor_type as string) ?? null,
        actor_id: (r.actor_id as string) ?? null,
        agent_version: (r.agent_version as string) ?? null,
        created_at: (r.created_at as string) ?? null,
      })),

      findings: ((findingRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        rule: (r.rule as string) ?? null,
        rule_name: (r.rule_name as string) ?? null,
        severity: (r.severity as string) ?? null,
        status: (r.status as string) ?? null,
        detail: (r.detail as string) ?? null,
        evidenceId: (r.evidence_id as string) ?? null,
        missing_info: (r.missing_info as string) ?? null,
        jurisdiction_id: (r.jurisdiction_id as string) ?? null,
        finding_fingerprint: (r.finding_fingerprint as string) ?? null,
        reviewed_by: (r.reviewed_by as string) ?? null,
        reviewed_at: (r.reviewed_at as string) ?? null,
        generated_by_agent: (r.generated_by_agent as string) ?? null,
        agent_version: (r.agent_version as string) ?? null,
        rule_status: (r.rule_status as string) ?? null,
        citation: (r.citation as string) ?? null,
        source_url: (r.source_url as string) ?? null,
        authority: (r.authority as string) ?? null,
        policy_pack: (r.policy_pack as string) ?? null,
        policy_version: (r.policy_version as string) ?? null,
        provisional: (r.provisional as number) ?? null,
        recommended_action: (r.recommended_action as string) ?? null,
        created_at: (r.created_at as string) ?? null,
      })),

      workflowRuns: ((runRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        workflow_id: r.workflow_id as string,
        status: r.status as string,
        current_stage: (r.current_stage as string) ?? null,
        sourceEvidenceId: (r.source_evidence_id as string) ?? null,
        notice_type: (r.notice_type as string) ?? null,
        service_date: (r.service_date as string) ?? null,
        response_due_date: (r.response_due_date as string) ?? null,
        deadline_confidence: (r.deadline_confidence as string) ?? null,
        created_by: (r.created_by as string) ?? null,
        created_at: (r.created_at as string) ?? null,
        updated_at: (r.updated_at as string) ?? null,
      })),

      workflowStageResults: ((stageRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        runId: r.run_id as string,
        stage_id: r.stage_id as string,
        status: r.status as string,
        summary: (r.summary as string) ?? null,
        output: (r.output as string) ?? null,
        blocked_reason: (r.blocked_reason as string) ?? null,
        next_action: (r.next_action as string) ?? null,
        started_at: (r.started_at as string) ?? null,
        completed_at: (r.completed_at as string) ?? null,
      })),

      workflowAuthorizations: ((authRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        runId: r.run_id as string,
        stage_id: r.stage_id as string,
        authorized_by: r.authorized_by as string,
        authorized_at: r.authorized_at as string,
        content_hash: r.content_hash as string,
        attestation: r.attestation as string,
        supersededOnImport: true as const,
      })),

      workflowMailings: ((mailingRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        runId: r.run_id as string,
        authorizationId: (r.authorization_id as string) ?? null,
        provider: (r.provider as string) ?? null,
        provider_job_id: (r.provider_job_id as string) ?? null,
        mail_class: (r.mail_class as string) ?? null,
        tracking_number: (r.tracking_number as string) ?? null,
        expected_delivery_date: (r.expected_delivery_date as string) ?? null,
        proof_url: (r.proof_url as string) ?? null,
        delivered_at: (r.delivered_at as string) ?? null,
        last_status: (r.last_status as string) ?? null,
        proofEvidenceId: (r.proof_evidence_id as string) ?? null,
        error_code: (r.error_code as string) ?? null,
        error_message: (r.error_message as string) ?? null,
        created_at: (r.created_at as string) ?? null,
      })),

      responseDrafts: ((draftRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        title: (r.title as string) ?? null,
        recipient_name: (r.recipient_name as string) ?? null,
        recipient_company: (r.recipient_company as string) ?? null,
        recipient_address1: (r.recipient_address1 as string) ?? null,
        recipient_address2: (r.recipient_address2 as string) ?? null,
        recipient_city: (r.recipient_city as string) ?? null,
        recipient_state: (r.recipient_state as string) ?? null,
        recipient_postal_code: (r.recipient_postal_code as string) ?? null,
        recipient_country: (r.recipient_country as string) ?? null,
        subject: (r.subject as string) ?? null,
        body: (r.body as string) ?? null,
        status: (r.status as string) ?? null,
        created_by: (r.created_by as string) ?? null,
        created_at: (r.created_at as string) ?? null,
        finalized_at: (r.finalized_at as string) ?? null,
      })),

      caseCommunications: ((commRows.results ?? []) as Record<string, unknown>[]).map((r) => ({
        id: r.id as string,
        purpose: (r.purpose as string) ?? null,
        status: (r.status as string) ?? null,
        mail_class: (r.mail_class as string) ?? null,
        sourceDocumentId: (r.source_document_id as string) ?? null,
        provider: (r.provider as string) ?? null,
        provider_job_id: (r.provider_job_id as string) ?? null,
        recipient_name: (r.recipient_name as string) ?? null,
        recipient_company: (r.recipient_company as string) ?? null,
        recipient_address1: (r.recipient_address1 as string) ?? null,
        recipient_address2: (r.recipient_address2 as string) ?? null,
        recipient_city: (r.recipient_city as string) ?? null,
        recipient_state: (r.recipient_state as string) ?? null,
        recipient_postal_code: (r.recipient_postal_code as string) ?? null,
        recipient_country: (r.recipient_country as string) ?? null,
        matter_reference: (r.matter_reference as string) ?? null,
        metadata: (r.metadata as string) ?? null,
        tracking_number: (r.tracking_number as string) ?? null,
        proof_url: (r.proof_url as string) ?? null,
        error_code: (r.error_code as string) ?? null,
        error_message: (r.error_message as string) ?? null,
        created_at: (r.created_at as string) ?? null,
        submitted_at: (r.submitted_at as string) ?? null,
        accepted_at: (r.accepted_at as string) ?? null,
        delivered_at: (r.delivered_at as string) ?? null,
      })),

      projectSettingsJson: settingsRow?.settings_json ?? null,
    };

    const zipInput: Record<string, Uint8Array> = {
      "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
      ...files,
    };
    const zipped = zipSync(zipInput, { level: 6 });

    const actor = humanActor(user);
    await emitAuditEvent({
      db,
      actor,
      action: "case.export",
      resourceType: "project",
      resourceId: id,
      detail: `Exported case '${manifest.sourceCaseName}' as a case file (${evidence.length} evidence records, ${Object.keys(files).length} files)`,
    });

    const filenameSafe = (manifest.sourceCaseName || "case").replace(/[^\w.\- ]/g, "_").slice(0, 80);
    return new NextResponse(zipped as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filenameSafe}-${id}.fpcase.zip"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
