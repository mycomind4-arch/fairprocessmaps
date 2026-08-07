/**
 * AI Agent Permission Boundary
 * 
 * Enforced in code — not just docs. This is the critical safety layer.
 * 
 * The boundary:
 * 
 *   Evidence → Event → Observation → Finding → Assessment → Action
 * 
 * AI agents operate in the "Observation" and "Finding" layers.
 * They CANNOT operate in the "Evidence" or "Action" layers.
 * 
 * Agents CAN:
 *   ✅ Create observations (findings)
 *   ✅ Propose relationships (finding → evidence, finding → statute)
 *   ✅ Attach evidence (upload documents)
 *   ✅ Create events (emit findings, recon results)
 * 
 * Agents CANNOT:
 *   ❌ Modify or delete evidence
 *   ❌ Alter or delete historical events (immutability)
 *   ❌ Declare legal conclusions (neutrality guardrail)
 *   ❌ Modify or delete findings after creation
 *   ❌ Send external communications
 *   ❌ Modify case status
 *   ❌ Alter authority chain relationships
 * 
 * This module is the single enforcement point. All agent actions must pass through here.
 */

import {
  type ActorType,
  checkAgentPermission,
  assertAgentPermission,
  assertFindingNeutrality,
  applyNeutralityGuardrail,
} from "./event-store";

// Re-export for convenience
export { checkAgentPermission, assertAgentPermission, assertFindingNeutrality, applyNeutralityGuardrail };

// ── Permission Model ──

export const PERMISSION_MODEL = {
  // ── Agents CAN ──
  allowed: {
    "evidence.attach": ["ai_agent", "scraper", "user", "system"],
    "observation.create": ["ai_agent", "user"],
    "relationship.propose": ["ai_agent", "user", "system"],
    "relationship.create": ["ai_agent", "scraper", "user", "system"],
    "event.create": ["ai_agent", "scraper", "user", "system"],
    "finding.create": ["ai_agent", "user"],
    "evidence.upload": ["user", "scraper", "system"],
    "timeline.event.create": ["ai_agent", "user", "system"],
  },

  // ── Agents CANNOT ──
  forbidden: [
    "evidence.modify",        // Evidence is immutable once created
    "evidence.delete",        // Evidence cannot be destroyed
    "event.alter",            // Events are append-only (immutability)
    "event.delete",           // Events cannot be removed
    "legal_conclusion.declare", // Neutrality guardrail — no legal conclusions
    "finding.modify",         // Findings are immutable once created
    "finding.delete",         // Findings cannot be removed
    "case.status.change",     // Only users can change case status
    "external.send",          // Agents cannot send external communications
    "authority.alter",        // Authority chain is immutable
  ],

  // ── Neutrality Guardrail ──
  // AI agents must never produce legal conclusions. Only evidentiary observations.
  // 
  // ❌ "The government violated due process."
  // ✅ "Notice record indicates service date Jan 3. Statute X requires service 
  //     before hearing. Hearing occurred Jan 4. Potential procedural discrepancy: yes."
  //
  // The guardrail is enforced by rewriting forbidden words in finding details.
  guardrail: {
    forbidden: [
      "violated", "violation", "unlawful", "illegal", "guilty", "liable",
      "non-compliant", "invalid", "void", "unconstitutional",
    ],
    replacements: {
      "violated": "deviation detected from",
      "violation": "deviation detected",
      "unlawful": "deviation detected",
      "illegal": "deviation detected",
      "guilty": "evidence suggests",
      "liable": "evidence suggests",
      "non-compliant": "deviation detected from",
      "invalid": "conflict identified with",
      "void": "conflict identified with",
      "unconstitutional": "conflict identified with",
    },
  },
} as const;

// ── Permission Check Wrapper ──
// Wrap any agent action to enforce the permission boundary.

export function withAgentPermission<T extends (...args: any[]) => any>(
  action: string,
  actorType: ActorType,
  fn: T
): T {
  return ((...args: any[]) => {
    assertAgentPermission(action, actorType);
    return fn(...args);
  }) as T;
}

// ── Finding Creation Guard ──
// All AI-generated findings must pass through this function.
// It enforces both the permission boundary and the neutrality guardrail.

export function createAgentFinding(params: {
  rule: string;
  ruleName: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  evidenceId?: string;
  statuteId?: string;
}): {
  rule: string;
  ruleName: string;
  severity: string;
  detail: string;       // Guardrail-applied detail
  guardrailBlocks: string[];
  isNeutral: boolean;
} {
  // Apply neutrality guardrail to the detail text
  const { text, blocks } = applyNeutralityGuardrail(params.detail);

  return {
    rule: params.rule,
    ruleName: params.ruleName,
    severity: params.severity,
    detail: text,
    guardrailBlocks: blocks,
    isNeutral: blocks.length === 0,
  };
}

// ── Validation: Immutability Boundary ──
// Verify that an actor is not attempting to modify an immutable resource.

export function assertImmutability(
  resource: "evidence" | "event" | "finding" | "relationship",
  operation: "create" | "read" | "update" | "delete",
  actorType: ActorType
): void {
  if (operation === "create" || operation === "read") {
    return; // Creates and reads are generally allowed
  }

  // Update and delete are forbidden for these resources
  const immutable: Record<string, string[]> = {
    evidence: ["update", "delete"],
    event: ["update", "delete"],
    finding: ["update", "delete"],
    relationship: ["update", "delete"], // Relationships are temporal, not mutable
  };

  const forbiddenOps = immutable[resource];
  if (forbiddenOps?.includes(operation)) {
    const action = `${resource}.${operation === "update" ? "modify" : "delete"}`;
    assertAgentPermission(action, actorType);
  }
}

// ── Agent Action Log ──
// Every agent action should be logged for audit purposes.
// This is separate from the event store — it's a permission audit trail.

export interface AgentActionLog {
  action: string;
  actorType: ActorType;
  actorId: string;
  resource: string;
  resourceId: string;
  allowed: boolean;
  timestamp: string;
  guardrailBlocks?: string[];
}

export function logAgentAction(
  action: string,
  actorType: ActorType,
  actorId: string,
  resource: string,
  resourceId: string,
  guardrailBlocks?: string[]
): AgentActionLog {
  return {
    action,
    actorType,
    actorId,
    resource,
    resourceId,
    allowed: checkAgentPermission(action, actorType),
    timestamp: new Date().toISOString(),
    guardrailBlocks,
  };
}
