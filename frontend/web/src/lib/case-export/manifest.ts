/**
 * Case file export/import — the manifest shape.
 *
 * A case file is a single .zip: one `manifest.json` describing every row
 * that belongs to a case, plus the actual evidence bytes under `files/`.
 * Reopening a case file rebuilds the case from scratch in whatever
 * organization imports it — nothing here is a live pointer back into the
 * organization that exported it.
 *
 * Two rules this format exists to enforce (see export/route.ts and
 * import/route.ts for where each is applied):
 *
 *   1. An import can never land in, or read from, an organization other
 *      than the importing user's own. Every organization_id in the file is
 *      discarded on import and replaced with the importing user's org.
 *
 *   2. A re-import (or importing a copy of a case you already imported)
 *      never collides with existing rows. Every ID in the file is
 *      regenerated on import; the manifest's IDs are only a map for
 *      rewiring foreign keys within the same file, not real identifiers
 *      once imported.
 *
 * What this deliberately does NOT carry over as "live": workflow
 * authorizations. An authorization is a specific human's attestation that
 * they read specific content and approved sending it. That attestation
 * does not transfer to a new copy of the case in a new organization, so
 * imported authorizations are recorded for history only (see
 * `WorkflowAuthorizationRecord.supersededOnImport`) and cannot satisfy the
 * engine's authorization gate for a new mailing.
 */

export const CASE_FILE_FORMAT_VERSION = 1;

export interface CaseFileManifest {
  formatVersion: number;
  exportedAt: string;
  exportedBy: string;
  sourceCaseId: string;
  sourceCaseName: string;

  property: PropertyRecord | null;
  project: ProjectRecord;
  legacyCase: LegacyCaseRecord | null;

  evidence: EvidenceRecord[];
  timelineEvents: TimelineEventRecord[];
  findings: FindingRecord[];

  workflowRuns: WorkflowRunRecord[];
  workflowStageResults: WorkflowStageResultRecord[];
  workflowAuthorizations: WorkflowAuthorizationRecord[];
  workflowMailings: WorkflowMailingRecord[];

  responseDrafts: ResponseDraftRecord[];
  caseCommunications: CaseCommunicationRecord[];

  projectSettingsJson: string | null;
}

export interface PropertyRecord {
  id: string;
  apn: string | null;
  address: string | null;
  city: string | null;
  county: string | null;
  zoning: string | null;
  acres: number | null;
  legal_desc: string | null;
  centroid_lng: number | null;
  centroid_lat: number | null;
  geom_geojson: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  case_type: string | null;
  department: string | null;
  status: string | null;
  due_process_score: number | null;
  opened_at: string | null;
  closed_at: string | null;
}

export interface LegacyCaseRecord {
  id: string;
  name: string;
  case_number: string | null;
  case_type: string | null;
  status: string | null;
  priority: string | null;
  description: string | null;
  due_date: string | null;
  opened_at: string | null;
  closed_at: string | null;
}

export interface EvidenceRecord {
  id: string;
  source: string | null;
  doc_type: string | null;
  title: string | null;
  status: string | null;
  extracted_text: string | null;
  ai_summary: string | null;
  content_type: string | null;
  original_filename: string | null;
  sha256_hash: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
  withdrawn: number | null;
  withdrawn_at: string | null;
  /** Path inside the zip's files/ directory, or null if no blob was stored. */
  filePath: string | null;
}

export interface TimelineEventRecord {
  id: string;
  evidenceId: string | null;
  event_date: string | null;
  event_type: string;
  description: string;
  actor_type: string | null;
  actor_id: string | null;
  agent_version: string | null;
  created_at: string | null;
}

export interface FindingRecord {
  id: string;
  rule: string | null;
  rule_name: string | null;
  severity: string | null;
  status: string | null;
  detail: string | null;
  evidenceId: string | null;
  missing_info: string | null;
  jurisdiction_id: string | null;
  finding_fingerprint: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  generated_by_agent: string | null;
  agent_version: string | null;
  rule_status: string | null;
  citation: string | null;
  source_url: string | null;
  authority: string | null;
  policy_pack: string | null;
  policy_version: string | null;
  provisional: number | null;
  recommended_action: string | null;
  created_at: string | null;
}

export interface WorkflowRunRecord {
  id: string;
  workflow_id: string;
  status: string;
  current_stage: string | null;
  sourceEvidenceId: string | null;
  notice_type: string | null;
  service_date: string | null;
  response_due_date: string | null;
  deadline_confidence: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface WorkflowStageResultRecord {
  id: string;
  runId: string;
  stage_id: string;
  status: string;
  summary: string | null;
  output: string | null;
  blocked_reason: string | null;
  next_action: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface WorkflowAuthorizationRecord {
  id: string;
  runId: string;
  stage_id: string;
  authorized_by: string;
  authorized_at: string;
  content_hash: string;
  attestation: string;
  /**
   * Always true once imported — kept as a historical record of who
   * authorized what in the source case, but it can never satisfy a live
   * authorization check in the imported copy. See module doc.
   */
  supersededOnImport: true;
}

export interface WorkflowMailingRecord {
  id: string;
  runId: string;
  authorizationId: string | null;
  provider: string | null;
  provider_job_id: string | null;
  mail_class: string | null;
  tracking_number: string | null;
  expected_delivery_date: string | null;
  proof_url: string | null;
  delivered_at: string | null;
  last_status: string | null;
  proofEvidenceId: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
}

export interface ResponseDraftRecord {
  id: string;
  title: string | null;
  recipient_name: string | null;
  recipient_company: string | null;
  recipient_address1: string | null;
  recipient_address2: string | null;
  recipient_city: string | null;
  recipient_state: string | null;
  recipient_postal_code: string | null;
  recipient_country: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  created_by: string | null;
  created_at: string | null;
  finalized_at: string | null;
}

export interface CaseCommunicationRecord {
  id: string;
  purpose: string | null;
  status: string | null;
  mail_class: string | null;
  sourceDocumentId: string | null;
  provider: string | null;
  provider_job_id: string | null;
  recipient_name: string | null;
  recipient_company: string | null;
  recipient_address1: string | null;
  recipient_address2: string | null;
  recipient_city: string | null;
  recipient_state: string | null;
  recipient_postal_code: string | null;
  recipient_country: string | null;
  matter_reference: string | null;
  metadata: string | null;
  tracking_number: string | null;
  proof_url: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string | null;
  submitted_at: string | null;
  accepted_at: string | null;
  delivered_at: string | null;
}

export const MAX_CASE_FILE_BYTES = 200 * 1024 * 1024; // 200 MB, generous for a case this size
