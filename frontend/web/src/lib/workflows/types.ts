/**
 * Notice-response workflow contract.
 *
 * A workflow is an ordered set of stages carrying a case from "a notice arrived"
 * to "a response was mailed and proved". It exists because the steps are the
 * same every time and the consequences of skipping one are severe — a missed
 * deadline, an unproven mailing, a response that concedes a fact.
 *
 * ## The gate is the point
 *
 * One structural rule governs everything here: **no stage that acts on the
 * outside world may run without a human authorization recorded first.**
 *
 * Drafting is reversible. Mailing is not. Once a document reaches an agency it
 * is part of the record, it may concede facts, start clocks, or waive
 * arguments, and no amount of software can retract it. So `requiresAuthorization`
 * is not advisory metadata — the runner refuses to execute such a stage unless
 * an authorization row exists naming a human, and that check lives in the
 * engine rather than in each stage, so a new stage cannot forget it.
 *
 * This is the same trust boundary the agent system already uses (AI proposes,
 * humans decide), extended to physical mail, where the stakes are higher
 * because the action cannot be undone.
 */

/**
 * A stage's identity is only meaningful within its own workflow — two
 * different workflows can both have a stage called "authorize" without
 * colliding, because every lookup (getStage, readyStages, the engine) is
 * always scoped to one workflow's stage list, never the union of all of them.
 * Left as `string` rather than a closed union so a new workflow can define
 * its own stage ids without editing this file.
 */
export type StageId = string;

export type StageStatus =
  | "pending"
  | "running"
  | "complete"
  | "blocked"
  | "failed"
  | "skipped"
  /** Reached a human gate and is waiting. Not an error. */
  | "awaiting_authorization";

export interface StageDefinition {
  id: StageId;
  name: string;
  /** What this stage does, in language a non-lawyer can act on. */
  description: string;
  /**
   * True when the stage acts irreversibly on the outside world. The runner
   * refuses to execute these without a recorded human authorization.
   */
  requiresAuthorization: boolean;
  /** Stages that must be complete first. */
  dependsOn: StageId[];
  /** Whether an LLM participates. Recorded so a reader knows what to distrust. */
  usesAI: boolean;
}

export interface StageResult {
  stageId: StageId;
  status: StageStatus;
  /** Human-readable outcome. */
  summary: string;
  /** Structured payload, stage-specific. */
  output?: Record<string, unknown>;
  /** Why the stage could not proceed, when blocked or failed. */
  blockedReason?: string;
  /** What a human should do to unblock it. */
  nextAction?: string;
  startedAt: string;
  completedAt?: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  caseId: string;
  organizationId: string;
  status: "running" | "awaiting_authorization" | "complete" | "failed" | "cancelled";
  currentStage: StageId | null;
  results: StageResult[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A recorded human authorization for an irreversible stage.
 *
 * Deliberately specific: it names the exact document version being authorized,
 * so an authorization cannot be reused for different content. Changing the
 * draft after authorization invalidates it.
 */
export interface StageAuthorization {
  runId: string;
  stageId: StageId;
  authorizedBy: string;
  authorizedAt: string;
  /** Hash of the exact content authorized. */
  contentHash: string;
  /** Free-text confirmation the human typed. */
  attestation: string;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  /** Notice types this workflow handles. */
  appliesTo: string[];
  stages: StageDefinition[];
}

// ── Stage catalogue ─────────────────────────────────────────────────────────

export const NOTICE_RESPONSE_STAGES: StageDefinition[] = [
  {
    id: "intake",
    name: "Register the notice",
    description:
      "Store the notice document with a content hash so the copy analyzed is provably the copy received.",
    requiresAuthorization: false,
    dependsOn: [],
    usesAI: false,
  },
  {
    id: "classify",
    name: "Identify the notice",
    description:
      "Determine what kind of notice this is and which agency issued it. Proposed, not concluded — a misread notice type changes every deadline downstream.",
    requiresAuthorization: false,
    dependsOn: ["intake"],
    usesAI: true,
  },
  {
    id: "extract",
    name: "Pull the facts",
    description:
      "Extract parties, service date, case number, alleged conditions, and cited authorities. Every extracted field cites the page it came from.",
    requiresAuthorization: false,
    dependsOn: ["classify"],
    usesAI: true,
  },
  {
    id: "deadline",
    name: "Compute the response window",
    description:
      "Derive the response deadline from policy pack rules. Deterministic — no model involved.",
    requiresAuthorization: false,
    dependsOn: ["extract"],
    usesAI: false,
  },
  {
    id: "analyze",
    name: "Run procedural checkpoints",
    description:
      "Measure the case file against the jurisdiction's checkpoints. Deterministic.",
    requiresAuthorization: false,
    dependsOn: ["extract"],
    usesAI: false,
  },
  {
    id: "draft",
    name: "Draft the response",
    description:
      "Produce a response letter preserving objections and requesting the record. A starting point for a human to edit, never a finished document.",
    requiresAuthorization: false,
    dependsOn: ["deadline", "analyze"],
    usesAI: true,
  },
  {
    id: "authorize",
    name: "Human review and authorization",
    description:
      "A person reads the draft, edits it, and authorizes sending. Nothing leaves the building before this.",
    requiresAuthorization: false,
    dependsOn: ["draft"],
    usesAI: false,
  },
  {
    id: "mail",
    name: "Send by trackable mail",
    description:
      "Send the authorized document by certified mail with return receipt. Irreversible.",
    requiresAuthorization: true,
    dependsOn: ["authorize"],
    usesAI: false,
  },
  {
    id: "prove",
    name: "Record proof of service",
    description:
      "File the tracking number and delivery proof as evidence and add it to the timeline. Proof of mailing is often worth more than the letter's contents.",
    requiresAuthorization: false,
    dependsOn: ["mail"],
    usesAI: false,
  },
];

export const NOTICE_RESPONSE_WORKFLOW: WorkflowDefinition = {
  id: "notice-response",
  name: "Notice Response",
  description:
    "Carries an agency notice from receipt to a proved, mailed response — computing the deadline, preserving objections, and recording proof of service.",
  appliesTo: [
    "notice_of_violation",
    "administrative_citation",
    "abatement_order",
    "code_enforcement_notice",
    "permit_denial",
    "hearing_notice",
    "lien_notice",
  ],
  stages: NOTICE_RESPONSE_STAGES,
};

/**
 * Public Records Request workflow.
 *
 * Distinct from Notice Response in one important way: the person is the one
 * INITIATING contact with the agency, not responding to one. Sending is
 * still gated the same way — a request letter is still outward-facing and
 * still irreversible once mailed — but there is no inbound deadline to
 * compute at intake. Instead, the workflow's own request date becomes the
 * trigger the CPRA response-timing rule measures against, which is why
 * "log the request" and "log the response" are both explicit stages: the
 * timeline events they write are exactly what that policy rule and the
 * Deadline Bar read.
 */
export const PUBLIC_RECORDS_REQUEST_STAGES: StageDefinition[] = [
  {
    id: "draft_request",
    name: "Draft the request",
    description:
      "Produce a records request letter identifying the records sought and citing the Public Records Act. A starting point for a human to edit.",
    requiresAuthorization: false,
    dependsOn: [],
    usesAI: true,
  },
  {
    id: "authorize",
    name: "Human review and authorization",
    description: "A person reads the draft, edits it, and authorizes sending.",
    requiresAuthorization: false,
    dependsOn: ["draft_request"],
    usesAI: false,
  },
  {
    id: "send",
    name: "Send the request",
    description:
      "Send the authorized request by trackable mail (or log that it was sent by email/in person). Irreversible once sent.",
    requiresAuthorization: true,
    dependsOn: ["authorize"],
    usesAI: false,
  },
  {
    id: "log_request",
    name: "Record the request on the timeline",
    description:
      "Write a records_request_sent event with the real send date. This date is what the CPRA response-timing rule and the Deadline Bar measure against — nothing downstream works without it.",
    requiresAuthorization: false,
    dependsOn: ["send"],
    usesAI: false,
  },
  {
    id: "log_response",
    name: "Record the outcome",
    description:
      "When a response arrives (or the window closes with none), record what happened. A logged non-response is itself the finding, not a gap to fill in later.",
    requiresAuthorization: false,
    dependsOn: ["log_request"],
    usesAI: false,
  },
];

export const PUBLIC_RECORDS_REQUEST_WORKFLOW: WorkflowDefinition = {
  id: "public-records-request",
  name: "Public Records Request",
  description:
    "Drafts, sends, and tracks a Public Records Act request — logging the send date so the statutory response window can be measured, and recording whatever response (or silence) follows.",
  appliesTo: [],
  stages: PUBLIC_RECORDS_REQUEST_STAGES,
};

/**
 * Every workflow FairProcess knows how to run, keyed by id. A UI catalog
 * lists these; starting a run looks one up by id here rather than importing
 * a specific workflow's constants directly, so adding a workflow means
 * adding one entry here, not touching every call site that runs one.
 */
export const WORKFLOW_REGISTRY: Record<string, WorkflowDefinition> = {
  [NOTICE_RESPONSE_WORKFLOW.id]: NOTICE_RESPONSE_WORKFLOW,
  [PUBLIC_RECORDS_REQUEST_WORKFLOW.id]: PUBLIC_RECORDS_REQUEST_WORKFLOW,
};

export function getWorkflow(id: string): WorkflowDefinition | null {
  return WORKFLOW_REGISTRY[id] ?? null;
}

export function getStage(stages: StageDefinition[], id: StageId): StageDefinition | null {
  return stages.find((s) => s.id === id) ?? null;
}

/** Stages whose dependencies are all complete. */
export function readyStages(stages: StageDefinition[], results: StageResult[]): StageDefinition[] {
  const complete = new Set(
    results.filter((r) => r.status === "complete").map((r) => r.stageId),
  );
  return stages.filter(
    (s) => !complete.has(s.id) && s.dependsOn.every((d) => complete.has(d)),
  );
}
