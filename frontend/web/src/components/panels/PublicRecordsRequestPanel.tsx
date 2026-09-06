"use client";

import { useEffect, useState } from "react";
import { Check, Circle, Loader2, Lock, AlertTriangle, Sparkles, Send, ShieldCheck } from "lucide-react";

/**
 * Public Records Request walkthrough.
 *
 * Structurally the same rail-plus-gate pattern as Notice Response, but this
 * workflow's later stages (log_request, log_response) exist because nothing
 * in the system can observe how a letter was actually delivered, or whether
 * an agency ever answered it — only a human knows that. Those two stages are
 * small forms, not model calls, and what they write becomes the exact
 * timeline event the CPRA response-timing rule and the Deadline Bar both
 * read. Filling them in is not busywork; it is the fact the rest of the
 * system depends on.
 */

interface StageDef {
  id: string;
  name: string;
  description: string;
  requiresAuthorization: boolean;
  usesAI: boolean;
}

interface StageResult {
  stage_id: string;
  status: string;
  summary: string | null;
  output: Record<string, unknown> | null;
  next_action: string | null;
}

interface Run {
  id: string;
  status: string;
  stages: StageResult[];
}

function statusOf(stage: StageDef, results: StageResult[]): string {
  return results.find((r) => r.stage_id === stage.id)?.status ?? "pending";
}

function StageIcon({ status }: { status: string }) {
  if (status === "complete")
    return (
      <span className="w-6 h-6 rounded-full bg-fp-green/12 flex items-center justify-center shrink-0">
        <Check className="w-3.5 h-3.5 text-fp-green" />
      </span>
    );
  if (status === "awaiting_authorization")
    return (
      <span className="w-6 h-6 rounded-full bg-fp-amber/15 flex items-center justify-center shrink-0 ring-2 ring-fp-amber/20">
        <Lock className="w-3.5 h-3.5 text-fp-amber" />
      </span>
    );
  if (status === "blocked" || status === "failed")
    return (
      <span className="w-6 h-6 rounded-full bg-fp-red/12 flex items-center justify-center shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 text-fp-red" />
      </span>
    );
  return (
    <span className="w-6 h-6 rounded-full bg-fp-surface-2 flex items-center justify-center shrink-0">
      <Circle className="w-2.5 h-2.5 text-fp-text-dim" />
    </span>
  );
}

export default function PublicRecordsRequestPanel({ projectId }: { projectId: string }) {
  const [definition, setDefinition] = useState<{ stages: StageDef[] } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state for the pieces only a human can supply.
  const [recordsSought, setRecordsSought] = useState("");
  const [caseReference, setCaseReference] = useState("");
  const [attestation, setAttestation] = useState("");
  const [sentDate, setSentDate] = useState("");
  const [sentMethod, setSentMethod] = useState("certified mail");
  const [responded, setResponded] = useState<"yes" | "no" | "">("");
  const [responseDate, setResponseDate] = useState("");

  async function load() {
    const res = await fetch(`/api/v1/cases/${projectId}/workflows`, { credentials: "include" });
    if (res.ok) {
      const json = (await res.json()) as {
        catalog?: { id: string; stages: StageDef[] }[];
        runs: Run[];
      };
      const def = json.catalog?.find((w) => w.id === "public-records-request");
      if (def) setDefinition({ stages: def.stages });
      setRun(
        json.runs?.find(
          (r) => (r as unknown as { workflow_id?: string }).workflow_id === "public-records-request",
        ) ?? null,
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [projectId]);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/workflows`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workflowId: "public-records-request" }),
      });
      if (res.ok) await advance();
    } finally {
      setBusy(false);
    }
  }

  async function advance(stageInput?: Record<string, unknown>) {
    if (!run && !stageInput) return;
    setBusy(true);
    try {
      const runId = run?.id;
      if (!runId) return;
      await fetch(`/api/v1/workflows/${runId}/advance`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageInput }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function authorize(draftBody: string) {
    if (!run) return;
    setBusy(true);
    try {
      await fetch(`/api/v1/workflows/${run.id}/authorize`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId: "send", documentText: draftBody, attestation }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="h-64 rounded-[10px] shimmer" />;

  // ── Not started ──
  if (!run) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-fp-text">Send a records request</h2>
          <p className="text-sm text-fp-text-muted mt-2 max-w-2xl leading-relaxed">
            Drafts a Public Records Act request, and — once you tell it when the letter
            actually went out — logs the send date so the statutory response window
            shows up on your Deadline Bar automatically.
          </p>
        </div>

        <div className="fp-panel p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-fp-text mb-2">
              What records are you requesting?
            </label>
            <textarea
              value={recordsSought}
              onChange={(e) => setRecordsSought(e.target.value)}
              rows={3}
              placeholder="e.g. all notices, inspection reports, and correspondence regarding APN 508-141-038-000 from January 2024 to present"
              className="w-full rounded-lg border border-fp-border px-3 py-2 text-sm focus:border-fp-blue focus:outline-none transition-colors resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-fp-text mb-2">
              Case or matter reference (optional)
            </label>
            <input
              value={caseReference}
              onChange={(e) => setCaseReference(e.target.value)}
              placeholder="e.g. Case CE-2024-XXXX"
              className="w-full rounded-lg border border-fp-border px-3 py-2 text-sm focus:border-fp-blue focus:outline-none transition-colors"
            />
          </div>
          <button
            onClick={start}
            disabled={busy || !recordsSought.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-40 transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Draft the request
          </button>
        </div>
      </div>
    );
  }

  const stages = definition?.stages ?? [];
  const draft = run.stages.find((s) => s.stage_id === "draft_request")?.output as
    | { subject?: string; body?: string }
    | undefined;
  const currentStatus = (id: string) => run.stages.find((s) => s.stage_id === id)?.status;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium text-fp-text">Records request</h2>

      <div className="fp-panel divide-y divide-fp-border">
        {stages.map((stage) => {
          const status = statusOf(stage, run.stages);
          const result = run.stages.find((r) => r.stage_id === stage.id);
          return (
            <div key={stage.id} className="px-5 py-4 flex items-start gap-4">
              <StageIcon status={status} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-fp-text">{stage.name}</span>
                  {stage.usesAI && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-fp-purple/10 text-fp-purple">
                      <Sparkles className="w-2.5 h-2.5" /> AI proposed
                    </span>
                  )}
                </div>
                {result?.summary && (
                  <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed">{result.summary}</p>
                )}

                {/* Log-the-send form, shown when this stage is the one waiting on input. */}
                {stage.id === "log_request" && status !== "complete" && currentStatus("send") !== undefined && (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[11px] text-fp-text-dim mb-1">Date actually sent</label>
                      <input
                        type="date"
                        value={sentDate}
                        onChange={(e) => setSentDate(e.target.value)}
                        className="rounded-lg border border-fp-border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-fp-text-dim mb-1">Method</label>
                      <select
                        value={sentMethod}
                        onChange={(e) => setSentMethod(e.target.value)}
                        className="rounded-lg border border-fp-border px-2 py-1.5 text-sm"
                      >
                        <option>certified mail</option>
                        <option>email</option>
                        <option>in person</option>
                        <option>county portal</option>
                      </select>
                    </div>
                    <button
                      onClick={() => advance({ sentDate, method: sentMethod })}
                      disabled={busy || !sentDate}
                      className="px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 disabled:opacity-40 transition-colors"
                    >
                      Log it
                    </button>
                  </div>
                )}

                {/* Log-the-response form. */}
                {stage.id === "log_response" && status !== "complete" && currentStatus("log_request") === "complete" && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-fp-text">
                        <input type="radio" checked={responded === "yes"} onChange={() => setResponded("yes")} />
                        A response arrived
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-fp-text">
                        <input type="radio" checked={responded === "no"} onChange={() => setResponded("no")} />
                        No response / window closed
                      </label>
                    </div>
                    {responded === "yes" && (
                      <input
                        type="date"
                        value={responseDate}
                        onChange={(e) => setResponseDate(e.target.value)}
                        className="rounded-lg border border-fp-border px-2 py-1.5 text-sm"
                      />
                    )}
                    <button
                      onClick={() =>
                        advance({
                          responded: responded === "yes",
                          responseDate: responded === "yes" ? responseDate : undefined,
                        })
                      }
                      disabled={busy || !responded}
                      className="px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 disabled:opacity-40 transition-colors"
                    >
                      Record outcome
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* The gate. */}
      {currentStatus("send") === "awaiting_authorization" && draft?.body && (
        <div className="fp-panel border-fp-amber/40 overflow-hidden">
          <div className="px-6 py-4 bg-fp-amber/[0.06] border-b border-fp-amber/25 flex items-start gap-3">
            <Lock className="w-5 h-5 text-fp-amber shrink-0 mt-0.5" />
            <h3 className="text-sm font-semibold text-fp-amber">
              Read this before it goes out — nothing sends without you saying so
            </h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="rounded-lg border border-fp-border bg-fp-surface-2/40 max-h-56 overflow-y-auto px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap font-mono">
              {draft.body}
            </div>
            <textarea
              value={attestation}
              onChange={(e) => setAttestation(e.target.value)}
              rows={2}
              placeholder="I have read the final letter and authorize sending it."
              className="w-full rounded-lg border border-fp-border px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={() => authorize(draft.body!)}
              disabled={busy || attestation.trim().length < 20}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fp-amber text-white text-sm font-medium hover:bg-fp-amber/90 disabled:opacity-40 transition-colors"
            >
              <ShieldCheck className="w-4 h-4" /> Authorize sending
            </button>
          </div>
        </div>
      )}

      {!["awaiting_authorization"].includes(run.status) && run.status !== "complete" && (
        <button
          onClick={() => advance()}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Continue
        </button>
      )}
    </div>
  );
}
