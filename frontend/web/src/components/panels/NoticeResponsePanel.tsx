"use client";

import { useEffect, useState } from "react";
import {
  Check, Circle, Loader2, Lock, AlertTriangle, ChevronRight,
  Sparkles, ShieldCheck, Send, FileText, Play,
} from "lucide-react";

/**
 * Notice response workflow.
 *
 * Two UX problems this solves.
 *
 * First, a staged process is only legible if you can see where you are in it.
 * The rail shows every stage, what it does, and — critically — which stages
 * involve a model. A user deciding how much to trust a draft deserves to know
 * a model wrote it without reading documentation.
 *
 * Second, and more important: **the authorization step must feel like what it
 * is.** Mailing a document to an agency is irreversible; it can concede facts
 * and start clocks. A modal with an OK button would communicate the opposite.
 * So authorization here requires reading the final text in a scrollable pane
 * and typing a sentence — not because the string is validated for meaning, but
 * because typing is a moment of deliberation and clicking is not.
 *
 * The friction is the feature. Everywhere else in this panel, the aim is to
 * remove steps.
 */

type StageStatus =
  | "pending" | "running" | "complete" | "blocked"
  | "failed" | "skipped" | "awaiting_authorization";

interface StageDef {
  id: string;
  name: string;
  description: string;
  requiresAuthorization: boolean;
  usesAI: boolean;
  dependsOn: string[];
}

interface StageResult {
  stage_id: string;
  status: StageStatus;
  summary: string | null;
  output: Record<string, unknown> | null;
  next_action: string | null;
  blocked_reason: string | null;
}

interface Run {
  id: string;
  status: string;
  current_stage: string | null;
  notice_type: string | null;
  response_due_date: string | null;
  deadline_confidence: string | null;
  created_at: string;
  stages: StageResult[];
}

function statusOf(stage: StageDef, results: StageResult[]): StageStatus {
  return results.find((r) => r.stage_id === stage.id)?.status ?? "pending";
}

function StageIcon({ status }: { status: StageStatus }) {
  switch (status) {
    case "complete":
      return (
        <span className="w-6 h-6 rounded-full bg-fp-green/12 flex items-center justify-center shrink-0">
          <Check className="w-3.5 h-3.5 text-fp-green" />
        </span>
      );
    case "running":
      return (
        <span className="w-6 h-6 rounded-full bg-fp-blue/12 flex items-center justify-center shrink-0">
          <Loader2 className="w-3.5 h-3.5 text-fp-blue animate-spin" />
        </span>
      );
    case "awaiting_authorization":
      return (
        <span className="w-6 h-6 rounded-full bg-fp-amber/15 flex items-center justify-center shrink-0 ring-2 ring-fp-amber/20">
          <Lock className="w-3.5 h-3.5 text-fp-amber" />
        </span>
      );
    case "blocked":
    case "failed":
      return (
        <span className="w-6 h-6 rounded-full bg-fp-red/12 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 text-fp-red" />
        </span>
      );
    default:
      return (
        <span className="w-6 h-6 rounded-full bg-fp-surface-2 flex items-center justify-center shrink-0">
          <Circle className="w-2.5 h-2.5 text-fp-text-dim" />
        </span>
      );
  }
}

/**
 * The gate.
 *
 * The document is shown in full, in a monospaced pane the user must scroll.
 * The confirm button stays disabled until they have typed a sentence. This is
 * the one place in the product where friction is deliberate.
 */
function AuthorizationGate({
  draftBody,
  draftSubject,
  onAuthorize,
  busy,
}: {
  draftBody: string;
  draftSubject: string;
  onAuthorize: (attestation: string) => void;
  busy: boolean;
}) {
  const [attestation, setAttestation] = useState("");
  const [readToEnd, setReadToEnd] = useState(false);

  const longEnough = attestation.trim().length >= 20;
  const ready = longEnough && readToEnd && !busy;

  return (
    <div className="fp-panel border-fp-amber/40 overflow-hidden">
      <div className="px-6 py-4 bg-fp-amber/[0.06] border-b border-fp-amber/25 flex items-start gap-3">
        <Lock className="w-5 h-5 text-fp-amber shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-fp-amber">
            This step sends a document you cannot take back
          </h3>
          <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed max-w-2xl">
            Once this letter reaches the agency it becomes part of the record. It can
            concede facts, start clocks, and waive arguments. Read it in full before
            authorizing — nothing here has been reviewed by a lawyer.
          </p>
        </div>
      </div>

      <div className="p-6 space-y-5">
        <div>
          <div className="fp-eyebrow mb-2">Final text — scroll to the end</div>
          <div className="rounded-lg border border-fp-border bg-fp-surface-2/40">
            <div className="px-4 py-2.5 border-b border-fp-border text-xs font-medium text-fp-text">
              {draftSubject || "(no subject)"}
            </div>
            <div
              onScroll={(e) => {
                const el = e.currentTarget;
                if (el.scrollHeight - el.scrollTop - el.clientHeight < 24) setReadToEnd(true);
              }}
              className="max-h-72 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed text-fp-text whitespace-pre-wrap font-mono scrollbar-thin"
            >
              {draftBody}
            </div>
          </div>
          {!readToEnd && (
            <p className="text-xs text-fp-text-dim mt-2">
              Scroll to the bottom of the letter to continue.
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="attestation"
            className="block text-xs font-medium text-fp-text mb-2"
          >
            In your own words, confirm you have read this and authorize sending it
          </label>
          <textarea
            id="attestation"
            value={attestation}
            onChange={(e) => setAttestation(e.target.value)}
            disabled={!readToEnd}
            rows={2}
            placeholder="I have read the final letter and authorize sending it to the agency."
            className="w-full rounded-lg border border-fp-border px-3 py-2.5 text-sm text-fp-text placeholder:text-fp-text-dim disabled:bg-fp-surface-2/60 disabled:cursor-not-allowed focus:border-fp-blue focus:outline-none transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-fp-text-dim">
              Recorded against your name and the exact text above.
            </p>
            {attestation.length > 0 && !longEnough && (
              <p className="text-xs text-fp-amber">
                {20 - attestation.trim().length} more characters
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={() => onAuthorize(attestation.trim())}
            disabled={!ready}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fp-amber text-white text-sm font-medium hover:bg-fp-amber/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Authorize sending
          </button>
          <p className="text-xs text-fp-text-dim">
            Authorizing does not send. You will send in a separate step.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function NoticeResponsePanel({ projectId }: { projectId: string }) {
  const [definition, setDefinition] = useState<{ stages: StageDef[] } | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch(`/api/v1/cases/${projectId}/workflows`, {
      credentials: "include",
    });
    if (res.ok) {
      const json = (await res.json()) as { definition: { stages: StageDef[] }; runs: Run[] };
      setDefinition(json.definition);
      setRuns(json.runs ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [projectId]);

  const run = runs[0] ?? null;

  async function advance() {
    if (!run) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/workflows/${run.id}/advance`, {
        method: "POST",
        credentials: "include",
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function authorizeMail(attestation: string) {
    if (!run) return;
    const draft = run.stages.find((s) => s.stage_id === "draft")?.output as
      | { body?: string }
      | undefined;
    if (!draft?.body) return;

    setBusy(true);
    try {
      await fetch(`/api/v1/workflows/${run.id}/authorize`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stageId: "mail",
          documentText: draft.body,
          attestation,
        }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-24 rounded-[10px] shimmer" />
        <div className="h-64 rounded-[10px] shimmer" />
      </div>
    );
  }

  // ── Empty state ──
  if (!run) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-fp-text">Respond to a notice</h2>
          <p className="text-sm text-fp-text-muted mt-2 max-w-2xl leading-relaxed">
            Takes an agency notice from the evidence vault and carries it through to a
            mailed response with proof of service — computing the response window,
            preserving objections, and requesting the record.
          </p>
        </div>

        <div className="fp-panel p-8 text-center">
          <FileText className="w-8 h-8 text-fp-text-dim mx-auto" />
          <h3 className="text-sm font-medium text-fp-text mt-4">No response in progress</h3>
          <p className="text-xs text-fp-text-muted mt-2 max-w-md mx-auto leading-relaxed">
            Upload the notice to the evidence vault first, then start a response from it.
            Nothing is sent without your explicit authorization.
          </p>
        </div>

        {definition && (
          <div>
            <div className="fp-eyebrow mb-3">What happens when you start</div>
            <div className="space-y-2">
              {definition.stages.map((s, i) => (
                <div key={s.id} className="flex items-start gap-3 py-2">
                  <span className="text-xs text-fp-text-dim font-mono tabular-nums mt-0.5 shrink-0">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-fp-text">{s.name}</span>
                      {s.usesAI && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-fp-purple/10 text-fp-purple">
                          <Sparkles className="w-2.5 h-2.5" /> AI
                        </span>
                      )}
                      {s.requiresAuthorization && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-fp-amber/10 text-fp-amber">
                          <Lock className="w-2.5 h-2.5" /> Needs your approval
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">
                      {s.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Active run ──
  const stages = definition?.stages ?? [];
  const awaiting = run.status === "awaiting_authorization";
  const draft = run.stages.find((s) => s.stage_id === "draft")?.output as
    | { body?: string; subject?: string; openQuestions?: string[] }
    | undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-medium text-fp-text">Notice response</h2>
          <p className="text-xs text-fp-text-dim mt-1">
            Started {run.created_at?.slice(0, 10)}
            {run.notice_type && ` · ${run.notice_type.replace(/_/g, " ")}`}
          </p>
        </div>
        {!awaiting && (
          <button
            onClick={advance}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-50 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Continue
          </button>
        )}
      </div>

      {/* Stage rail */}
      <div className="fp-panel divide-y divide-fp-border">
        {stages.map((stage) => {
          const status = statusOf(stage, run.stages);
          const result = run.stages.find((r) => r.stage_id === stage.id);
          const isCurrent = run.current_stage === stage.id;

          return (
            <div
              key={stage.id}
              className={`px-5 py-4 flex items-start gap-4 ${
                isCurrent ? "bg-fp-surface-2/40" : ""
              }`}
            >
              <StageIcon status={status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-sm font-medium ${
                      status === "complete" ? "text-fp-text" : "text-fp-text-muted"
                    }`}
                  >
                    {stage.name}
                  </span>
                  {stage.usesAI && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-fp-purple/10 text-fp-purple">
                      <Sparkles className="w-2.5 h-2.5" /> AI proposed
                    </span>
                  )}
                  {stage.requiresAuthorization && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-fp-amber/10 text-fp-amber">
                      <Lock className="w-2.5 h-2.5" /> Gated
                    </span>
                  )}
                </div>

                {result?.summary && (
                  <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed">
                    {result.summary}
                  </p>
                )}

                {result?.next_action && status !== "complete" && (
                  <div className="flex items-start gap-1.5 mt-2 text-xs text-fp-blue">
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-px" />
                    <span>{result.next_action}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The gate, when we are at it */}
      {awaiting && draft?.body && (
        <AuthorizationGate
          draftBody={draft.body}
          draftSubject={draft.subject ?? ""}
          onAuthorize={authorizeMail}
          busy={busy}
        />
      )}

      {draft?.openQuestions && draft.openQuestions.length > 0 && (
        <div className="fp-panel p-5">
          <div className="fp-eyebrow mb-3">Open questions from the draft</div>
          <ul className="space-y-2">
            {draft.openQuestions.map((q, i) => (
              <li key={i} className="flex gap-2 text-sm text-fp-text-muted leading-relaxed">
                <span className="text-fp-text-dim shrink-0">·</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-fp-text-dim leading-relaxed flex items-start gap-2">
        <Send className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Drafts are generated by a model and are a starting point, not legal advice.
          Nothing is mailed without an authorization recorded against your name and the
          exact text you approved.
        </span>
      </p>
    </div>
  );
}
