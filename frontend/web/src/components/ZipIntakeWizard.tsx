"use client";

/**
 * Walks a person through turning an uploaded ZIP into a read case file:
 * expand → propose groups → review/correct → confirm cost → chunked read →
 * hand off to analysis.
 *
 * Nothing here auto-confirms. The heuristic and model-assisted groupings are
 * both proposals; a person must look at them before a single full read
 * happens, and must see and accept a cost estimate before either the cheap
 * classification pass or the full reads run.
 */

import { useEffect, useState } from "react";
import {
  Loader2,
  AlertCircle,
  FileText,
  Sparkles,
  ArrowRight,
  Scissors,
  X,
  CheckCircle2,
  DollarSign,
} from "lucide-react";

type Confidence = "high" | "medium" | "low";

interface ProposedGroup {
  evidenceIds: string[];
  confidence: Confidence;
  reason: string;
}

interface CostEstimate {
  documentCount: number;
  groupCount: number;
  cheapPassCalls: number;
  fullReadCalls: number;
  approxUsd: number;
  note: string;
}

type Step =
  | "expanding"
  | "grouping"
  | "review"
  | "reading"
  | "done"
  | "error";

interface Props {
  projectId: string;
  zipEvidenceId: string;
  onClose: () => void;
  onDone: () => void;
  /** Optional: jump to the Analysis / Legal tabs once reading is done. */
  onNavigate?: (section: "analysis" | "legal") => void;
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  high: "bg-fp-green/15 text-fp-green border border-fp-green/30",
  medium: "bg-fp-amber/15 text-fp-amber border border-fp-amber/30",
  low: "bg-fp-red/15 text-fp-red border border-fp-red/30",
};

const BATCH_SIZE = 4;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export default function ZipIntakeWizard({ projectId, zipEvidenceId, onClose, onDone, onNavigate }: Props) {
  const [step, setStep] = useState<Step>("expanding");
  const [error, setError] = useState<string | null>(null);

  const [titleById, setTitleById] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<{ path: string; reason: string }[]>([]);
  const [groups, setGroups] = useState<ProposedGroup[]>([]);
  const [cost, setCost] = useState<CostEstimate | null>(null);
  const [modelPassApplied, setModelPassApplied] = useState(false);
  const [applyingModelPass, setApplyingModelPass] = useState(false);

  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [readSummary, setReadSummary] = useState<{
    read: number;
    eventsAdded: number;
    failures: number;
    gaps: number;
  } | null>(null);

  // Step 1 — expand the ZIP. No model calls; just unzip, sanitize, store.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/cases/${projectId}/expand-zip`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ evidenceId: zipEvidenceId }),
        });
        const data: any = await res.json();
        if (!res.ok) throw new Error(data.error || `Expansion failed (${res.status})`);
        if (cancelled) return;

        const created: { id: string; title: string }[] = data.created ?? [];
        const duplicates: { duplicateOfEvidenceId: string; title: string }[] = data.duplicates ?? [];
        const ids = [
          ...created.map((c) => c.id),
          ...duplicates.map((d) => d.duplicateOfEvidenceId),
        ];
        const titles: Record<string, string> = {};
        for (const c of created) titles[c.id] = c.title;
        for (const d of duplicates) titles[d.duplicateOfEvidenceId] = d.title;
        setTitleById(titles);
        setSkipped(data.skipped ?? []);

        if (ids.length === 0) {
          setError("Nothing in this archive could be expanded into readable evidence.");
          setStep("error");
          return;
        }

        setStep("grouping");
        const groupRes = await fetch(`/api/v1/cases/${projectId}/group-documents`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ evidenceIds: ids }),
        });
        const groupData: any = await groupRes.json();
        if (!groupRes.ok) throw new Error(groupData.error || `Grouping failed (${groupRes.status})`);
        if (cancelled) return;
        setGroups(groupData.groups ?? []);
        setCost(groupData.costEstimate ?? null);
        setStep("review");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong expanding this archive.");
        setStep("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, zipEvidenceId]);

  const allIds = Object.keys(titleById);

  const runModelPass = async () => {
    setApplyingModelPass(true);
    try {
      const res = await fetch(`/api/v1/cases/${projectId}/group-documents`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidenceIds: allIds, useModel: true }),
      });
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || `Refinement failed (${res.status})`);
      setGroups(data.groups ?? []);
      setCost(data.costEstimate ?? null);
      setModelPassApplied(Boolean(data.modelPassApplied));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refine the grouping.");
    } finally {
      setApplyingModelPass(false);
    }
  };

  // Manual corrections — the safety net the heuristics and the cheap pass
  // both fall back to.
  const extractToOwnGroup = (groupIdx: number, evidenceId: string) => {
    setGroups((prev) => {
      const next = prev.map((g) => ({ ...g, evidenceIds: [...g.evidenceIds] }));
      const group = next[groupIdx];
      group.evidenceIds = group.evidenceIds.filter((id) => id !== evidenceId);
      const filtered = group.evidenceIds.length > 0 ? next : next;
      const withoutEmpty = filtered.filter((g) => g.evidenceIds.length > 0);
      withoutEmpty.push({
        evidenceIds: [evidenceId],
        confidence: "high",
        reason: "Split out for review by a person.",
      });
      return withoutEmpty;
    });
  };

  const mergeIntoGroup = (fromIdx: number, evidenceId: string, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setGroups((prev) => {
      const next = prev.map((g) => ({ ...g, evidenceIds: [...g.evidenceIds] }));
      next[fromIdx].evidenceIds = next[fromIdx].evidenceIds.filter((id) => id !== evidenceId);
      next[toIdx].evidenceIds.push(evidenceId);
      next[toIdx] = { ...next[toIdx], confidence: "medium", reason: "Merged manually for review." };
      return next.filter((g) => g.evidenceIds.length > 0);
    });
  };

  const confirmAndRead = async () => {
    setStep("reading");
    const documentGroups = groups.map((g) => g.evidenceIds);
    const batches = chunk(documentGroups, BATCH_SIZE);
    setBatchProgress({ done: 0, total: batches.length });

    let readTotal = 0;
    let eventsAdded = 0;
    let failures = 0;
    let gaps = 0;

    for (let i = 0; i < batches.length; i++) {
      try {
        const res = await fetch(`/api/v1/cases/${projectId}/intake`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ documentGroups: batches[i] }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (res.ok) {
          readTotal += data.read ?? 0;
          eventsAdded += data.eventsAdded ?? 0;
          failures += (data.failures ?? []).length;
          gaps += (data.gaps ?? []).length;
        } else {
          failures += batches[i].length;
        }
      } catch {
        // A failed batch does not lose prior progress — /intake is
        // idempotent per evidence, so the next batch (or a retry) proceeds
        // from wherever this one left off.
        failures += batches[i].length;
      }
      setBatchProgress({ done: i + 1, total: batches.length });
    }

    setReadSummary({ read: readTotal, eventsAdded, failures, gaps });
    setStep("done");
  };

  return (
    <div className="fixed inset-0 z-50 bg-fp-bg/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl surface-flat bg-fp-surface border border-fp-border shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-fp-border">
          <h2 className="text-base font-semibold text-fp-text flex items-center gap-2">
            <FileText className="w-4 h-4 text-fp-blue" /> Reading a ZIP bundle
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {(step === "expanding" || step === "grouping") && (
            <div className="flex items-center gap-3 py-8 justify-center text-sm text-fp-text-muted">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
              {step === "expanding" ? "Unzipping and sanitizing entries…" : "Proposing document groups from filenames…"}
            </div>
          )}

          {step === "error" && (
            <div className="flex items-start gap-3 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {step === "review" && (
            <>
              {skipped.length > 0 && (
                <details className="text-xs text-fp-text-dim">
                  <summary className="cursor-pointer">{skipped.length} entr{skipped.length === 1 ? "y" : "ies"} skipped</summary>
                  <ul className="mt-1.5 space-y-0.5 pl-4 list-disc">
                    {skipped.map((s, i) => (
                      <li key={i}>{s.path} — {s.reason}</li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-fp-surface-2 border border-fp-border">
                <div className="text-xs text-fp-text-muted">
                  <span className="font-medium text-fp-text">{cost?.documentCount ?? 0}</span> unread file
                  {cost?.documentCount === 1 ? "" : "s"} proposed as{" "}
                  <span className="font-medium text-fp-text">{cost?.groupCount ?? groups.length}</span> document
                  {(cost?.groupCount ?? groups.length) === 1 ? "" : "s"}.
                  {cost && (
                    <span className="flex items-center gap-1 mt-1 text-fp-amber">
                      <DollarSign className="w-3 h-3" /> ~${cost.approxUsd.toFixed(2)} to finish reading — {cost.note}
                    </span>
                  )}
                </div>
                {!modelPassApplied && (
                  <button
                    onClick={runModelPass}
                    disabled={applyingModelPass}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-surface text-fp-text text-xs font-medium border border-fp-border hover:border-fp-blue/40 disabled:opacity-50"
                  >
                    {applyingModelPass ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-fp-blue" />}
                    Improve grouping with a quick read
                  </button>
                )}
              </div>

              <p className="text-xs text-fp-text-dim">
                Review the proposed groups below. Low-confidence groups are a guess from filenames only —
                split or merge anything that looks wrong before continuing. Nothing is read in full yet.
              </p>

              <div className="space-y-2.5">
                {groups.map((g, gi) => (
                  <div key={gi} className="rounded-xl border border-fp-border p-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${CONFIDENCE_STYLE[g.confidence]}`}>
                        {g.confidence} confidence
                      </span>
                      <span className="text-xs text-fp-text-dim">{g.evidenceIds.length} file{g.evidenceIds.length === 1 ? "" : "s"}</span>
                    </div>
                    <p className="text-xs text-fp-text-muted mb-2">{g.reason}</p>
                    <ul className="space-y-1">
                      {g.evidenceIds.map((id) => (
                        <li key={id} className="flex items-center justify-between gap-2 text-xs text-fp-text bg-fp-surface-2 rounded-lg px-2 py-1">
                          <span className="truncate">{titleById[id] ?? id}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {g.evidenceIds.length > 1 && (
                              <button
                                onClick={() => extractToOwnGroup(gi, id)}
                                title="Split into its own document"
                                className="p-1 rounded text-fp-text-dim hover:text-fp-red hover:bg-fp-red/10"
                              >
                                <Scissors className="w-3 h-3" />
                              </button>
                            )}
                            {groups.length > 1 && (
                              <select
                                aria-label={`Move ${titleById[id] ?? id} to another group`}
                                className="text-[10px] bg-fp-surface border border-fp-border rounded px-1 py-0.5"
                                value=""
                                onChange={(e) => {
                                  const toIdx = Number(e.target.value);
                                  if (!Number.isNaN(toIdx)) mergeIntoGroup(gi, id, toIdx);
                                }}
                              >
                                <option value="" disabled>Move to…</option>
                                {groups.map((_, ti) =>
                                  ti === gi ? null : (
                                    <option key={ti} value={ti}>Group {ti + 1}</option>
                                  ),
                                )}
                              </select>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <button
                onClick={confirmAndRead}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90"
              >
                Confirm {groups.length} document{groups.length === 1 ? "" : "s"} and read
                {cost ? ` (~$${cost.approxUsd.toFixed(2)})` : ""} <ArrowRight className="w-4 h-4" />
              </button>
            </>
          )}

          {step === "reading" && (
            <div className="space-y-3 py-4">
              <div className="flex items-center gap-3 text-sm text-fp-text-muted">
                <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
                Reading document {Math.min(batchProgress.done * BATCH_SIZE, groups.length)} of {groups.length}…
              </div>
              <div className="h-2 rounded-full bg-fp-surface-2 overflow-hidden">
                <div
                  className="h-full bg-fp-blue transition-all"
                  style={{ width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%` }}
                />
              </div>
              <p className="text-xs text-fp-text-dim">
                Reading in batches of {BATCH_SIZE} — if one batch fails, completed documents are kept and the rest continue.
              </p>
            </div>
          )}

          {step === "done" && readSummary && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-fp-green text-sm">
                <CheckCircle2 className="w-5 h-5" />
                Read {readSummary.read} document{readSummary.read === 1 ? "" : "s"}, added {readSummary.eventsAdded} timeline event{readSummary.eventsAdded === 1 ? "" : "s"}.
              </div>
              {readSummary.failures > 0 && (
                <div className="flex items-center gap-2 text-fp-amber text-xs">
                  <AlertCircle className="w-3.5 h-3.5" /> {readSummary.failures} document{readSummary.failures === 1 ? "" : "s"} could not be read — check the Document Vault and retry those individually.
                </div>
              )}
              {readSummary.gaps > 0 && (
                <div className="text-xs text-fp-text-muted">
                  {readSummary.gaps} sequence observation{readSummary.gaps === 1 ? "" : "s"} were raised about the case arc — see the Analysis tab.
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { onNavigate?.("analysis"); onDone(); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-sm text-fp-text hover:border-fp-blue/40"
                >
                  View findings &amp; integrity report
                </button>
                <button
                  onClick={() => { onNavigate?.("legal"); onDone(); }}
                  className="flex-1 px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-sm text-fp-text hover:border-fp-blue/40"
                >
                  Draft a brief
                </button>
              </div>
              <button onClick={onDone} className="w-full text-xs text-fp-text-dim hover:text-fp-text">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
