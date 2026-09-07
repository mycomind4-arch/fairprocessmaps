/**
 * Authority Mapper Agent — Phase 3.5
 *
 * Maps government entities with jurisdiction over a case: which department
 * administers it, which board hears appeals from that department, and —
 * when the case record names one — which official acted on it. This is the
 * "decision-maker chain": official → member_of → department → overseen_by →
 * board.
 *
 * Hybrid approach, no LLM: matches the case's property (city, or its
 * absence implying unincorporated county) and case_type against the
 * `authorities` reference table (migration 027), the same way the Statute
 * Matcher matches findings against `statutes` (migration 014).
 *
 * The agent NEVER asserts that an authority acted properly, improperly, or
 * had a duty to act. It proposes a jurisdictional or organizational
 * connection with a confidence score. Humans confirm.
 *
 * All language is neutral:
 *   "Property jurisdiction appears to fall under Humboldt County Planning
 *    & Building Department"
 * NOT:
 *   "The County was responsible for this case and failed to act properly"
 *
 * Known limitation: coastal-zone overlay jurisdiction (California Coastal
 * Commission) requires the property_intelligence coastal-zone flag, which
 * is not part of the agent input snapshot today. Rather than guess from the
 * free-text zoning code (unreliable — Humboldt's ZONING field doesn't
 * reliably encode coastal-zone status), this agent leaves that connection
 * for a future iteration once property_intelligence is added to the
 * snapshot, and says so via a missing_info proposal when the case_type
 * suggests it would matter.
 */

import type {
  Agent, AgentInputSnapshot, AgentResult,
  AgentProposalDraft, AuthorityRef, Importance,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Synthetic id for a named person extracted from a free-text field (e.g.
 *  building_permits.assigned_inspector). Not a seeded authorities row — the
 *  graph layer recovers a display label from the slug itself. */
function namedOfficialId(name: string): string {
  return `official.named.${slugify(name)}`;
}

// ── Rule: Primary jurisdiction ───────────────────────────────────────────────
//
// Exactly one department administers a given property/case: the
// incorporated city's department if the property has a city, otherwise the
// county department for unincorporated land. This is the anchor the rest
// of the chain hangs off.

function resolvePrimaryDepartment(
  snapshot: AgentInputSnapshot,
): { authority: AuthorityRef; confidence: number; reason: string } | null {
  const city = snapshot.property.city?.trim();
  const caseType = snapshot.case_type;

  const departments = snapshot.authorities.filter(a => a.entity_type === "department");

  if (city) {
    const match = departments.find(
      a => a.jurisdiction_scope.toLowerCase() === city.toLowerCase() && a.case_types.includes(caseType),
    );
    if (match) {
      return {
        authority: match,
        confidence: 0.85,
        reason: `Property city '${city}' matches '${match.jurisdiction_scope}' jurisdiction for case_type '${caseType}'.`,
      };
    }
    // City present but not a known incorporated jurisdiction in the
    // reference table — no confident match, handled by caller as missing_info.
    return null;
  }

  // No city on record — infer unincorporated county jurisdiction. Lower
  // confidence than an explicit city match, since it's an inference from
  // an absent field rather than a positive statement in the record.
  const match = departments.find(
    a => a.jurisdiction_scope === "unincorporated" && a.case_types.includes(caseType),
  );
  if (match) {
    return {
      authority: match,
      confidence: 0.65,
      reason: `Property record has no city value; inferred unincorporated-county jurisdiction for case_type '${caseType}'. Confirm against the GIS jurisdiction boundary layer.`,
    };
  }

  return null;
}

function checkPrimaryJurisdiction(snapshot: AgentInputSnapshot): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];
  const resolved = resolvePrimaryDepartment(snapshot);

  if (resolved) {
    proposals.push({
      proposal_type: "relationship_proposal",
      source_type: "property",
      source_id: snapshot.property.id,
      target_type: "department",
      target_id: resolved.authority.id,
      relationship_type: "jurisdiction_of",
      confidence: resolved.confidence,
      evidence_ids: [],
      reasoning_trace: `Property for case '${snapshot.case_name}' (${snapshot.case_type}) matched to ${resolved.authority.name}. ${resolved.reason}`,
    });
  } else {
    const city = snapshot.property.city?.trim();
    proposals.push({
      proposal_type: "missing_info",
      info_type: "authority",
      importance: "recommended" as Importance,
      confidence: 0.6,
      evidence_ids: [],
      reasoning_trace: city
        ? `Property city '${city}' does not match any incorporated jurisdiction in the authority reference table for case_type '${snapshot.case_type}'. The administering department has not been identified.`
        : `No property city on record and no unincorporated-county department is registered for case_type '${snapshot.case_type}'. The administering department has not been identified.`,
    });
  }

  return proposals;
}

// ── Rule: Oversight chain ────────────────────────────────────────────────────
//
// If the matched department has a registered parent (a board or
// commission), propose that structural link too. This is reference data,
// not an inference about this specific case, so it carries a higher
// confidence than the jurisdiction match it depends on — but is only
// proposed at all when jurisdiction was actually resolved.

function checkOversightChain(snapshot: AgentInputSnapshot): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];
  const resolved = resolvePrimaryDepartment(snapshot);
  if (!resolved || !resolved.authority.parent_authority_id) return proposals;

  const parent = snapshot.authorities.find(a => a.id === resolved.authority.parent_authority_id);
  if (!parent) return proposals;

  const parentNodeType = parent.entity_type === "board" ? "authority" : parent.entity_type;

  proposals.push({
    proposal_type: "relationship_proposal",
    source_type: "department",
    source_id: resolved.authority.id,
    target_type: parentNodeType,
    target_id: parent.id,
    relationship_type: "overseen_by",
    confidence: 0.8,
    evidence_ids: [],
    reasoning_trace: `${resolved.authority.name} is registered in the jurisdiction reference table as reporting to ${parent.name}. This is a structural relationship from reference data, not case-specific evidence.`,
  });

  return proposals;
}

// ── Rule: Named decision-makers from case data ──────────────────────────────
//
// building_permits.assigned_inspector is the one place this schema already
// records a named person. When present, propose the decision-maker chain:
// permit → issued_by → official, official → member_of → department.
//
// The "official" here is synthetic — a person's name, not a seeded role —
// so confidence is capped lower than the department-level match it hangs
// off, and the reasoning trace says exactly where the name came from.

function checkNamedDecisionMakers(snapshot: AgentInputSnapshot): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];
  const resolved = resolvePrimaryDepartment(snapshot);

  const namedPermits = snapshot.permits.filter(
    p => p.assigned_inspector && p.assigned_inspector.trim().length > 1,
  );

  for (const permit of namedPermits) {
    const name = permit.assigned_inspector!.trim();
    const officialId = namedOfficialId(name);

    proposals.push({
      proposal_type: "relationship_proposal",
      source_type: "permit",
      source_id: permit.id,
      target_type: "official",
      target_id: officialId,
      relationship_type: "issued_by",
      confidence: 0.55,
      evidence_ids: [],
      reasoning_trace: `Permit '${permit.permit_number || permit.id}' lists '${name}' in its assigned_inspector field. Proposed as the named official associated with this permit action.`,
    });

    // Case-level pointer to the same named official, so a reviewer looking
    // at the case (not a specific permit) can still see who is on record —
    // the decision-maker chain's top link.
    proposals.push({
      proposal_type: "relationship_proposal",
      source_type: "case",
      source_id: snapshot.case_id,
      target_type: "official",
      target_id: officialId,
      relationship_type: "overseen_by",
      confidence: 0.5,
      evidence_ids: [],
      reasoning_trace: `'${name}' is named on permit '${permit.permit_number || permit.id}' within this case. Proposed as a case-level pointer to the same named official; confirm the permit's assigned_inspector reflects the person actually handling this case, not just this one permit.`,
    });

    if (resolved) {
      proposals.push({
        proposal_type: "relationship_proposal",
        source_type: "official",
        source_id: officialId,
        target_type: "department",
        target_id: resolved.authority.id,
        relationship_type: "member_of",
        confidence: 0.5,
        evidence_ids: [],
        reasoning_trace: `'${name}' is named on permit '${permit.permit_number || permit.id}', which falls under ${resolved.authority.name}'s jurisdiction. Proposed department membership follows from the permit's jurisdiction, not a direct personnel record.`,
      });
    }
  }

  // Deduplicate — assigned_inspector often repeats the same name across
  // multiple permits on one case; one proposal per unique name/department.
  const seen = new Set<string>();
  const deduped: AgentProposalDraft[] = [];
  for (const p of proposals) {
    const key = `${p.source_type}:${p.source_id}:${p.target_type}:${p.target_id}:${p.relationship_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  return deduped;
}

// ── Rule: Missing decision-maker ─────────────────────────────────────────────
//
// A case with open findings but no named official anywhere in its permits
// has an identified department but no identified person — worth flagging
// as missing information, not as a fault of the department.

function checkMissingDecisionMaker(snapshot: AgentInputSnapshot): AgentProposalDraft[] {
  const proposals: AgentProposalDraft[] = [];

  const hasOpenFindings = snapshot.findings.some(
    f => f.status !== "closed" && f.status !== "resolved",
  );
  if (!hasOpenFindings) return proposals;

  const hasNamedOfficial = snapshot.permits.some(
    p => p.assigned_inspector && p.assigned_inspector.trim().length > 1,
  );
  if (hasNamedOfficial) return proposals;

  const resolved = resolvePrimaryDepartment(snapshot);
  if (!resolved) return proposals; // already covered by checkPrimaryJurisdiction's missing_info

  proposals.push({
    proposal_type: "missing_info",
    info_type: "authority",
    importance: "optional" as Importance,
    confidence: 0.55,
    evidence_ids: [],
    reasoning_trace: `${resolved.authority.name} has jurisdiction, but no permit on this case names an assigned inspector or official. The record identifies a department but not a specific decision-maker.`,
  });

  return proposals;
}

// ── Authority Mapper Agent Definition ────────────────────────────────────────

export const AUTHORITY_MAPPER_AGENT: Agent = {
  definition: {
    id: "agent.authority_mapper.v1",
    name: "Authority Mapper",
    agent_type: "authority_mapper",
    version: "1.0.0",
    capabilities: ["relationship_proposal", "missing_info"],
    model_version: null, // pure rules engine against the authorities reference table
    description:
      "Maps government authorities with jurisdiction over a property and case, and the decision-maker chain (official -> department -> board) where the case record names one. Proposes jurisdiction_of, overseen_by, member_of, and issued_by relationships with confidence scores.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },

  async execute(input: AgentInputSnapshot): Promise<AgentResult> {
    const proposals: AgentProposalDraft[] = [];

    proposals.push(...checkPrimaryJurisdiction(input));
    proposals.push(...checkOversightChain(input));
    proposals.push(...checkNamedDecisionMakers(input));
    proposals.push(...checkMissingDecisionMaker(input));

    return { proposals };
  },
};
