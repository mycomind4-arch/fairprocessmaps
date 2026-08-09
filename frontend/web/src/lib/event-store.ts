import type { D1Database } from "@cloudflare/workers-types";

// NOTE: The canonical event store lives in D1. This module intentionally keeps
// display/replay helpers tolerant of both database-shaped snake_case events and
// older test/import payloads that use camelCase fields.

// ── Timeline Display Helpers ──

export function eventToTimelineDisplay(event: any): {
  event_type: string;
  description: string;
  event_date: string;
} {
  let payload: Record<string, any> = {};
  if (event.payload) {
    try {
      payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
    } catch {
      payload = {};
    }
  }

  const eventType = event.event_type ?? event.eventType ?? "unknown";
  const eventDate = event.event_date ?? event.eventDate ?? event.created_at ?? event.createdAt ?? new Date().toISOString();

  const typeMap: Record<string, { event_type: string; description: string }> = {
    "evidence.uploaded": { event_type: "evidence_uploaded", description: `Evidence uploaded: ${payload.title ?? "Unknown"}` },
    "evidence.processed": { event_type: "evidence_processed", description: `Evidence processed: ${payload.title ?? "Unknown"}` },
    "evidence.flagged": { event_type: "evidence_flagged", description: `Evidence flagged: ${payload.title ?? "Unknown"}` },
    "finding.created": { event_type: "finding_created", description: `Finding: ${payload.rule_name ?? payload.rule ?? "Unknown"}` },
    "finding.resolved": { event_type: "finding_resolved", description: `Finding resolved: ${payload.rule_name ?? "Unknown"}` },
    "ce.case_created": { event_type: "ce_case_created", description: `Code enforcement case opened: ${payload.case_number ?? "Unknown"}` },
    "ce.notice_served": { event_type: "notice_sent", description: `Notice served: ${payload.case_number ?? "Unknown"}` },
    "ce.hearing_scheduled": { event_type: "hearing_held", description: `Hearing scheduled: ${payload.case_number ?? "Unknown"}` },
    "ce.compliance_deadline": { event_type: "deadline", description: `Compliance deadline set: ${payload.case_number ?? "Unknown"}` },
    "ce.abatement": { event_type: "abatement", description: `Abatement action: ${payload.case_number ?? "Unknown"}` },
    "ce.appeal_filed": { event_type: "appeal_filed", description: `Appeal filed: ${payload.case_number ?? "Unknown"}` },
    "ce.closed": { event_type: "ce_closed", description: `Code enforcement case closed: ${payload.case_number ?? "Unknown"}` },
    "permit.created": { event_type: "permit_created", description: `Permit record created: ${payload.permit_number ?? "Unknown"}` },
    "permit.issued": { event_type: "permit_issued", description: `Permit issued: ${payload.permit_number ?? "Unknown"}` },
    "permit.inspection": { event_type: "permit_inspection", description: `Inspection: ${payload.permit_number ?? "Unknown"}` },
    "permit.finalized": { event_type: "permit_finalized", description: `Permit finalized: ${payload.permit_number ?? "Unknown"}` },
    "permit.expired": { event_type: "permit_expired", description: `Permit expired: ${payload.permit_number ?? "Unknown"}` },
    "recon.started": { event_type: "recon_started", description: "Property intelligence recon started" },
    "recon.completed": { event_type: "intelligence_gathered", description: `Property intelligence gathered: ${payload.agent_count ?? 0} agents` },
    "analysis.started": { event_type: "analysis_started", description: "Due process analysis started" },
    "analysis.completed": { event_type: "analysis_completed", description: `Due process analysis completed (score: ${payload.score ?? "N/A"})` },
    "case.created": { event_type: "case_created", description: `Case created: ${payload.name ?? "Unknown"}` },
    "case.updated": { event_type: "case_updated", description: "Case updated" },
    "case.closed": { event_type: "case_closed", description: "Case closed" },
    "relationship.created": { event_type: "relationship_created", description: `Relationship created: ${payload.relationship_type ?? "Unknown"}` },
  };

  const mapped = typeMap[eventType] ?? { event_type: eventType, description: eventType };
  return { ...mapped, event_date: eventDate };
}
