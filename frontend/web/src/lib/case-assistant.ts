/**
 * Case Assistant — a conversational, tool-using Claude session scoped to one
 * case.
 *
 * Different from synthesizeCaseReview (a one-shot batch review): this holds
 * a real conversation, and Claude can call tools mid-turn to read the case
 * record — timeline, evidence, findings, property intelligence, saved
 * documents — and to propose changes to it.
 *
 * The one rule that shapes this whole module: a tool that would change the
 * record (add, edit, or remove a timeline event) never executes on its own.
 * It's written to case_assistant_pending_actions and surfaced to a person;
 * the actual database write happens only from resolveAction, only after an
 * explicit approve. A misread date silently corrected by an agent is worse
 * than one left wrong and flagged — the same principle the vision pipeline
 * and policy engine already hold to (see docs/policy-packs.md). Drafting a
 * document is the one exception: it creates a new, freestanding artifact
 * (nothing existing is touched) exactly the way generateBrief already works
 * everywhere else in this app, so there's nothing to gate.
 */

import {
  callClaudeAgentTurn,
  synthesizePropertyIntelligence,
  type ClaudeBindingEnv,
  type ClaudeMessageParam,
  type ClaudeToolDef,
} from "./claude";
import { emitTimelineEvent, emitAuditEvent } from "./security/events";
import type { Actor } from "./security/types";
import { generateBrief, type BriefType } from "./brief-generator";
import { runAnalysis } from "./auto-triggers";

const MAX_LOOP_ITERATIONS = 6;

const VALID_EVENT_TYPES = [
  "notice_sent", "hearing_held", "appeal_filed", "deadline",
  "correspondence", "inspection", "decision", "fine_imposed",
  "lien_filed", "abatement", "eviction", "other",
];

const SYSTEM = `You are the case assistant for a due-process case workspace. You help the
person building this case understand their record and, when asked, propose
changes to it or draft documents.

Ground rules, non-negotiable:
- Everything you say about the case must come from the tools below, never
  from assumption or general knowledge of "how these cases usually go."
  If you haven't called a tool to check something, say you don't know yet
  and call it.
- You are not a lawyer and this is not legal advice. Describe what the
  record shows and what options exist; do not tell the person what a court
  will decide or guarantee an outcome.
- add_timeline_event, edit_timeline_event, and remove_timeline_event never
  take effect from your call alone — they're proposals a person approves or
  rejects. When you call one and get no result back yet, say it's a proposal
  awaiting approval, nothing more.
- If a tool_result for one of those three tools says it was actually
  applied/added/updated/removed (rather than describing a pending proposal),
  that means a person already approved it — say plainly that it's done now,
  never describe it as still awaiting approval. If it says the person
  rejected it, say that plainly instead and don't repeat the same proposal
  unless asked to.
- draft_document actually creates and saves a document immediately (it's a
  new artifact, nothing existing is touched) — say what you generated and
  where to find it.
- Keep answers short and concrete. This is a conversation, not a report.`;

// ── Tool schema ──────────────────────────────────────────────────────────────

const TOOLS: ClaudeToolDef[] = [
  {
    name: "get_timeline",
    description: "Read every timeline event on this case: dates, event types, descriptions, linked evidence.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_evidence",
    description: "List evidence on the case, or read one document's full extracted text by evidence_id.",
    input_schema: {
      type: "object",
      properties: {
        evidence_id: { type: "string", description: "Optional — read one document's full text instead of listing all." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_findings",
    description: "Read the procedural checkpoint findings (the policy-engine results) for this case.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_property_intelligence",
    description: "Read the property intelligence recon results (zoning, hazards, jurisdiction, permits, code enforcement, recorder records) for this case's property.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_documents",
    description: "List saved documents on this case: generated briefs/letters and response drafts.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_timeline_event",
    description: "Propose adding a new timeline event. Requires a person's approval before it's added.",
    input_schema: {
      type: "object",
      properties: {
        event_date: { type: "string", description: "YYYY-MM-DD" },
        event_type: { type: "string", enum: VALID_EVENT_TYPES },
        description: { type: "string" },
      },
      required: ["event_date", "event_type"],
      additionalProperties: false,
    },
  },
  {
    name: "edit_timeline_event",
    description: "Propose changing an existing timeline event's date, type, or description. Requires a person's approval.",
    input_schema: {
      type: "object",
      properties: {
        event_id: { type: "string" },
        event_date: { type: "string", description: "YYYY-MM-DD, if changing" },
        event_type: { type: "string", enum: VALID_EVENT_TYPES },
        description: { type: "string" },
      },
      required: ["event_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_timeline_event",
    description: "Propose removing a timeline event. Requires a person's approval.",
    input_schema: {
      type: "object",
      properties: { event_id: { type: "string" } },
      required: ["event_id"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_document",
    description: "Generate and save a document immediately: a motion to dismiss, an appeal letter, a complaint, or a case summary. This executes right away — it's a new document, nothing existing is changed.",
    input_schema: {
      type: "object",
      properties: {
        brief_type: { type: "string", enum: ["motion_to_dismiss", "appeal_letter", "complaint", "case_summary"] },
        defendant_name: { type: "string" },
        case_number: { type: "string" },
        court_name: { type: "string" },
      },
      required: ["brief_type"],
      additionalProperties: false,
    },
  },
];

const WRITE_TOOLS = new Set(["add_timeline_event", "edit_timeline_event", "remove_timeline_event"]);

// ── Persistence ──────────────────────────────────────────────────────────────

interface StoredMessage {
  role: "user" | "assistant";
  content: Array<Record<string, unknown>>;
}

async function loadHistory(db: D1Database, projectId: string, orgId: string): Promise<StoredMessage[]> {
  const rows = await db
    .prepare(
      `SELECT role, content FROM case_assistant_messages
        WHERE project_id = ? AND organization_id = ? ORDER BY created_at ASC`,
    )
    .bind(projectId, orgId)
    .all();
  return ((rows.results ?? []) as { role: string; content: string }[]).map((r) => ({
    role: r.role as "user" | "assistant",
    content: JSON.parse(r.content),
  }));
}

async function appendMessage(
  db: D1Database,
  projectId: string,
  orgId: string,
  role: "user" | "assistant",
  content: Array<Record<string, unknown>>,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO case_assistant_messages (id, project_id, organization_id, role, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), projectId, orgId, role, JSON.stringify(content))
    .run();
}

// ── Read-tool executors ──────────────────────────────────────────────────────

async function execReadTool(
  db: D1Database,
  projectId: string,
  orgId: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "get_timeline": {
      const rows = await db
        .prepare(
          `SELECT t.id, t.event_date, t.event_type, t.description, t.evidence_id, e.title AS evidence_title
             FROM timeline_events t LEFT JOIN evidence e ON t.evidence_id = e.id
            WHERE t.project_id = ? AND t.organization_id = ?
            ORDER BY t.event_date ASC`,
        )
        .bind(projectId, orgId)
        .all();
      return rows.results ?? [];
    }
    case "get_evidence": {
      if (input.evidence_id) {
        const row = await db
          .prepare(
            `SELECT id, title, doc_type, source, status, extracted_text, ai_summary, created_at
               FROM evidence WHERE id = ? AND project_id = ? AND organization_id = ?`,
          )
          .bind(input.evidence_id as string, projectId, orgId)
          .first();
        return row ?? { error: "No evidence with that id on this case." };
      }
      const rows = await db
        .prepare(
          `SELECT id, title, doc_type, source, status, ai_summary, created_at
             FROM evidence WHERE project_id = ? AND organization_id = ? AND withdrawn = 0
            ORDER BY created_at DESC`,
        )
        .bind(projectId, orgId)
        .all();
      return rows.results ?? [];
    }
    case "get_findings": {
      const rows = await db
        .prepare(
          `SELECT id, rule_name, severity, status, detail, evidence_id, created_at
             FROM due_process_findings WHERE project_id = ? AND organization_id = ?
            ORDER BY created_at DESC`,
        )
        .bind(projectId, orgId)
        .all();
      return rows.results ?? [];
    }
    case "get_property_intelligence": {
      const row = await db
        .prepare(
          `SELECT pi.raw_data, pi.fetched_at
             FROM property_intelligence pi
             JOIN projects p ON p.property_id = pi.property_id
            WHERE p.id = ? AND p.organization_id = ?
            ORDER BY pi.fetched_at DESC LIMIT 1`,
        )
        .bind(projectId, orgId)
        .first<{ raw_data: string; fetched_at: string }>();
      if (!row) return { error: "No property intelligence recon has been run for this case yet." };
      try {
        return { fetched_at: row.fetched_at, data: JSON.parse(row.raw_data) };
      } catch {
        return { fetched_at: row.fetched_at, data: row.raw_data };
      }
    }
    case "get_documents": {
      const [briefs, drafts] = await Promise.all([
        db.prepare(
          `SELECT id, brief_type, title, word_count, generated_at FROM generated_briefs
             WHERE project_id = ? AND organization_id = ? ORDER BY generated_at DESC`,
        ).bind(projectId, orgId).all(),
        db.prepare(
          `SELECT id, title, status, created_at FROM response_drafts
             WHERE case_id = ? AND organization_id = ? ORDER BY created_at DESC`,
        ).bind(projectId, orgId).all().catch(() => ({ results: [] })),
      ]);
      return { generated_briefs: briefs.results ?? [], response_drafts: drafts.results ?? [] };
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function previewForWriteTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "add_timeline_event":
      return `Add timeline event: ${input.event_type} on ${input.event_date}${input.description ? ` — "${input.description}"` : ""}`;
    case "edit_timeline_event":
      return `Edit timeline event ${input.event_id}: ${[
        input.event_date ? `date → ${input.event_date}` : null,
        input.event_type ? `type → ${input.event_type}` : null,
        input.description ? `description → "${input.description}"` : null,
      ].filter(Boolean).join(", ") || "(no changes specified)"}`;
    case "remove_timeline_event":
      return `Remove timeline event ${input.event_id}`;
    default:
      return `${name}(${JSON.stringify(input)})`;
  }
}

/** Applies an approved write tool call. Called only from resolveAction, only after a person approves. */
async function applyWriteTool(
  db: D1Database,
  projectId: string,
  orgId: string,
  actor: Actor,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "add_timeline_event": {
      const eventType = VALID_EVENT_TYPES.includes(input.event_type as string) ? (input.event_type as string) : "other";
      const id = await emitTimelineEvent({
        db,
        projectId,
        eventDate: input.event_date as string,
        eventType,
        description: (input.description as string) ?? "",
        actor,
      });
      await runAnalysis(projectId).catch(() => null);
      return `Added timeline event ${id} (${eventType} on ${input.event_date}).`;
    }
    case "edit_timeline_event": {
      const sets: string[] = [];
      const binds: unknown[] = [];
      if (input.event_date) { sets.push("event_date = ?"); binds.push(input.event_date); }
      if (input.event_type) { sets.push("event_type = ?"); binds.push(VALID_EVENT_TYPES.includes(input.event_type as string) ? input.event_type : "other"); }
      if (input.description !== undefined) { sets.push("description = ?"); binds.push(input.description); }
      if (sets.length === 0) return "No changes were specified, nothing updated.";
      binds.push(input.event_id, projectId, orgId);
      await db
        .prepare(`UPDATE timeline_events SET ${sets.join(", ")} WHERE id = ? AND project_id = ? AND organization_id = ?`)
        .bind(...binds)
        .run();
      await runAnalysis(projectId).catch(() => null);
      return `Updated timeline event ${input.event_id}.`;
    }
    case "remove_timeline_event": {
      await db
        .prepare(`DELETE FROM timeline_events WHERE id = ? AND project_id = ? AND organization_id = ?`)
        .bind(input.event_id, projectId, orgId)
        .run();
      await runAnalysis(projectId).catch(() => null);
      return `Removed timeline event ${input.event_id}.`;
    }
    default:
      throw new Error(`${name} is not a write tool`);
  }
}

// ── The loop ─────────────────────────────────────────────────────────────────

export interface PendingActionView {
  id: string;
  toolName: string;
  preview: string;
}

export interface AssistantTurnResult {
  reply: string;
  pendingActions: PendingActionView[];
}

async function loopUntilTextOrPending(
  env: ClaudeBindingEnv,
  db: D1Database,
  projectId: string,
  orgId: string,
  messages: ClaudeMessageParam[],
): Promise<AssistantTurnResult> {
  for (let iteration = 0; iteration < MAX_LOOP_ITERATIONS; iteration++) {
    const turn = await callClaudeAgentTurn(env, { system: SYSTEM, messages, tools: TOOLS, maxTokens: 2000 });

    if (turn.stopReason !== "tool_use") {
      const text = turn.content.find((b) => b.type === "text")?.text as string | undefined;
      await appendMessage(db, projectId, orgId, "assistant", turn.content);
      return { reply: text ?? "", pendingActions: [] };
    }

    await appendMessage(db, projectId, orgId, "assistant", turn.content);

    const toolUses = turn.content.filter((b) => b.type === "tool_use") as Array<{
      type: "tool_use"; id: string; name: string; input: Record<string, unknown>;
    }>;
    const textBlock = turn.content.find((b) => b.type === "text")?.text as string | undefined;

    const writeCalls = toolUses.filter((t) => WRITE_TOOLS.has(t.name));
    const readCalls = toolUses.filter((t) => !WRITE_TOOLS.has(t.name) && t.name !== "draft_document");
    const draftCalls = toolUses.filter((t) => t.name === "draft_document");

    // Draft-document calls execute immediately — they create a new artifact,
    // nothing existing is touched, so there's nothing to gate (see module doc).
    const draftResults = await Promise.all(
      draftCalls.map(async (t) => {
        try {
          const brief = await generateBrief({
            db, projectId, organizationId: orgId,
            briefType: t.input.brief_type as BriefType,
            defendantName: t.input.defendant_name as string | undefined,
            caseNumber: t.input.case_number as string | undefined,
            courtName: t.input.court_name as string | undefined,
          });
          return { id: t.id, result: "error" in brief ? { error: brief.error } : { saved: true, id: brief.id, title: brief.title, word_count: brief.word_count } };
        } catch (err) {
          return { id: t.id, result: { error: err instanceof Error ? err.message : "Draft generation failed" } };
        }
      }),
    );

    if (writeCalls.length > 0) {
      // A write proposal ends the turn here — surface it and wait. Any read
      // calls in the same batch still get answered so the model isn't left
      // hanging on tool_use blocks with no result when the person resumes.
      const pending: PendingActionView[] = [];
      const toolResultBlocks: Array<Record<string, unknown>> = [];

      for (const t of readCalls) {
        const result = await execReadTool(db, projectId, orgId, t.name, t.input);
        toolResultBlocks.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result).slice(0, 8000) });
      }
      for (const d of draftResults) {
        toolResultBlocks.push({ type: "tool_result", tool_use_id: d.id, content: JSON.stringify(d.result) });
      }
      for (const t of writeCalls) {
        const preview = previewForWriteTool(t.name, t.input);
        const actionId = crypto.randomUUID();
        await db.prepare(
          `INSERT INTO case_assistant_pending_actions
             (id, project_id, organization_id, tool_use_id, tool_name, tool_input, preview)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(actionId, projectId, orgId, t.id, t.name, JSON.stringify(t.input), preview).run();
        pending.push({ id: actionId, toolName: t.name, preview });
      }

      if (toolResultBlocks.length > 0) {
        await appendMessage(db, projectId, orgId, "user", toolResultBlocks);
      }

      return { reply: textBlock ?? "", pendingActions: pending };
    }

    // No writes this round — answer every read/draft call and loop again so
    // the model can use the results before it's done.
    const toolResultBlocks: Array<Record<string, unknown>> = [];
    for (const t of readCalls) {
      const result = await execReadTool(db, projectId, orgId, t.name, t.input);
      toolResultBlocks.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(result).slice(0, 8000) });
    }
    for (const d of draftResults) {
      toolResultBlocks.push({ type: "tool_result", tool_use_id: d.id, content: JSON.stringify(d.result) });
    }
    await appendMessage(db, projectId, orgId, "user", toolResultBlocks);
    messages = [...messages, { role: "assistant", content: turn.content }, { role: "user", content: toolResultBlocks }];
  }

  return { reply: "I'm not able to finish that in one pass — try asking a narrower question.", pendingActions: [] };
}

export async function sendAssistantMessage(
  env: ClaudeBindingEnv,
  db: D1Database,
  projectId: string,
  orgId: string,
  userText: string,
): Promise<AssistantTurnResult> {
  const history = await loadHistory(db, projectId, orgId);
  const userBlock = [{ type: "text", text: userText }];
  await appendMessage(db, projectId, orgId, "user", userBlock);

  const messages: ClaudeMessageParam[] = [...history, { role: "user", content: userBlock }];
  return loopUntilTextOrPending(env, db, projectId, orgId, messages);
}

export async function resolveAssistantAction(
  env: ClaudeBindingEnv,
  db: D1Database,
  projectId: string,
  orgId: string,
  actionId: string,
  approve: boolean,
  actor: Actor,
): Promise<AssistantTurnResult> {
  const action = await db
    .prepare(
      `SELECT tool_use_id, tool_name, tool_input, status FROM case_assistant_pending_actions
        WHERE id = ? AND project_id = ? AND organization_id = ?`,
    )
    .bind(actionId, projectId, orgId)
    .first<{ tool_use_id: string; tool_name: string; tool_input: string; status: string }>();

  if (!action) throw new Error("Pending action not found");
  if (action.status !== "pending") throw new Error(`This action was already ${action.status}`);

  let effect: string;
  if (approve) {
    const applied = await applyWriteTool(db, projectId, orgId, actor, action.tool_name, JSON.parse(action.tool_input));
    effect = `RESULT: APPROVED AND ALREADY APPLIED — this is done, not pending. ${applied} Tell the person it's applied now; do not describe it as awaiting approval.`;
  } else {
    effect = `RESULT: REJECTED — this will NOT be applied. Tell the person you won't make this change; do not repeat the same proposal unless they ask again.`;
  }

  await db
    .prepare(
      `UPDATE case_assistant_pending_actions SET status = ?, resolved_by = ?, resolved_at = datetime('now')
        WHERE id = ?`,
    )
    .bind(approve ? "approved" : "rejected", actor.id ?? null, actionId)
    .run();

  await emitAuditEvent({
    db, actor,
    action: approve ? "case_assistant.action.approved" : "case_assistant.action.rejected",
    resourceType: "case_assistant_pending_action",
    resourceId: actionId,
    detail: effect,
  });

  const toolResultBlocks = [{ type: "tool_result", tool_use_id: action.tool_use_id, content: effect }];
  await appendMessage(db, projectId, orgId, "user", toolResultBlocks);

  const history = await loadHistory(db, projectId, orgId);
  return loopUntilTextOrPending(env, db, projectId, orgId, history);
}

export async function getAssistantHistory(
  db: D1Database,
  projectId: string,
  orgId: string,
): Promise<{ messages: StoredMessage[]; pendingActions: PendingActionView[] }> {
  const messages = await loadHistory(db, projectId, orgId);
  const pendingRows = await db
    .prepare(
      `SELECT id, tool_name, preview FROM case_assistant_pending_actions
        WHERE project_id = ? AND organization_id = ? AND status = 'pending' ORDER BY created_at ASC`,
    )
    .bind(projectId, orgId)
    .all();
  const pendingActions = ((pendingRows.results ?? []) as { id: string; tool_name: string; preview: string }[]).map((r) => ({
    id: r.id, toolName: r.tool_name, preview: r.preview,
  }));
  return { messages, pendingActions };
}
