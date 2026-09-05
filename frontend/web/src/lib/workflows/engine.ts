/**
 * Workflow engine.
 *
 * Holds the one rule that matters: a stage marked `requiresAuthorization` does
 * not run without a recorded human authorization naming the exact content being
 * authorized.
 *
 * That check lives here rather than inside each stage on purpose. Putting it in
 * the stages means a future stage can forget it; putting it in the engine means
 * forgetting is impossible. The `mail` stage is the only one gated today, but
 * anything that touches the outside world — filing a portal submission, paying
 * a fee, contacting an agency — belongs behind the same gate.
 */

import type {
  StageAuthorization,
  StageDefinition,
  StageId,
  StageResult,
  WorkflowRun,
} from "./types";
import { NOTICE_RESPONSE_STAGES, getStage, readyStages } from "./types";

export interface StageContext {
  runId: string;
  caseId: string;
  organizationId: string;
  actor: string;
  /** Results of previously completed stages, for reading upstream output. */
  priorResults: StageResult[];
}

export type StageExecutor = (ctx: StageContext) => Promise<StageResult>;

export interface EngineDeps {
  /**
   * Returns the authorization for a stage, or null. The engine treats null as
   * "stop", never as "proceed".
   */
  loadAuthorization(runId: string, stageId: StageId): Promise<StageAuthorization | null>;
  /**
   * Hash of the content the stage is about to act on. Compared against the
   * authorized hash so editing a draft after authorization invalidates it.
   */
  currentContentHash(runId: string, stageId: StageId): Promise<string | null>;
  executors: Partial<Record<StageId, StageExecutor>>;
}

function now(): string {
  return new Date().toISOString();
}

function blocked(
  stage: StageDefinition,
  reason: string,
  nextAction: string,
  status: StageResult["status"] = "blocked",
): StageResult {
  return {
    stageId: stage.id,
    status,
    summary: reason,
    blockedReason: reason,
    nextAction,
    startedAt: now(),
    completedAt: now(),
  };
}

/**
 * Run one stage.
 *
 * Returns a result rather than throwing for expected refusals — a blocked
 * stage is normal workflow state, not an error condition. Genuine execution
 * failures are caught and reported as `failed` so one bad stage cannot abort a
 * run and lose the results of the stages that succeeded.
 */
export async function runStage(
  deps: EngineDeps,
  ctx: StageContext,
  stageId: StageId,
): Promise<StageResult> {
  const stage = getStage(stageId);
  if (!stage) {
    throw new Error(`Unknown stage: ${stageId}`);
  }

  // Dependencies.
  const complete = new Set(
    ctx.priorResults.filter((r) => r.status === "complete").map((r) => r.stageId),
  );
  const missing = stage.dependsOn.filter((d) => !complete.has(d));
  if (missing.length > 0) {
    return blocked(
      stage,
      `Cannot run "${stage.name}" — ${missing.join(", ")} has not completed.`,
      `Run ${missing[0]} first.`,
    );
  }

  // ── The gate ──
  //
  // Everything above is bookkeeping. This is the part that must not be
  // weakened: an irreversible stage requires a human, by name, having
  // authorized this exact content.
  if (stage.requiresAuthorization) {
    const auth = await deps.loadAuthorization(ctx.runId, stageId);

    if (!auth) {
      return blocked(
        stage,
        `"${stage.name}" sends a document outside the organization and has not been authorized.`,
        "A person must review the final document and authorize sending it.",
        "awaiting_authorization",
      );
    }

    const currentHash = await deps.currentContentHash(ctx.runId, stageId);
    if (currentHash && currentHash !== auth.contentHash) {
      // The document changed after it was signed off. Silently mailing the new
      // version would mean mailing something no human approved.
      return blocked(
        stage,
        `The document changed after ${auth.authorizedBy} authorized it. The earlier authorization does not cover the current text.`,
        "Re-read the current document and authorize it again.",
        "awaiting_authorization",
      );
    }
  }

  const executor = deps.executors[stageId];
  if (!executor) {
    return blocked(
      stage,
      `No executor is registered for "${stage.name}".`,
      "This stage is defined but not yet implemented.",
      "skipped",
    );
  }

  const startedAt = now();
  try {
    const result = await executor(ctx);
    return { ...result, startedAt, completedAt: now() };
  } catch (err) {
    return {
      stageId,
      status: "failed",
      summary: `"${stage.name}" failed: ${String(err)}`,
      blockedReason: String(err),
      nextAction: "Review the error and retry this stage.",
      startedAt,
      completedAt: now(),
    };
  }
}

/**
 * Advance a run as far as it can go without human input.
 *
 * Stops at the first gate rather than skipping past it, so a run always halts
 * in front of the human it needs rather than racing ahead to the next
 * automatable stage. A workflow that skipped a blocked mail step to run
 * something else would obscure the fact that it is waiting on a person.
 */
export async function advanceRun(
  deps: EngineDeps,
  ctx: StageContext,
): Promise<{ results: StageResult[]; haltedAt: StageId | null; status: WorkflowRun["status"] }> {
  const results = [...ctx.priorResults];

  for (;;) {
    const ready = readyStages(results);
    if (ready.length === 0) {
      const allDone = NOTICE_RESPONSE_STAGES.every((s) =>
        results.some((r) => r.stageId === s.id && r.status === "complete"),
      );
      return { results, haltedAt: null, status: allDone ? "complete" : "running" };
    }

    const next = ready[0];
    const result = await runStage(deps, { ...ctx, priorResults: results }, next.id);
    results.push(result);

    if (result.status === "awaiting_authorization") {
      return { results, haltedAt: next.id, status: "awaiting_authorization" };
    }
    if (result.status === "failed") {
      return { results, haltedAt: next.id, status: "failed" };
    }
    if (result.status === "blocked" || result.status === "skipped") {
      return { results, haltedAt: next.id, status: "running" };
    }
  }
}

/** Stable hash of document content, for authorization binding. */
export async function hashContent(content: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
