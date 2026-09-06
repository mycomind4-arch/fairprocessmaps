"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  UploadCloud, FileText, Image as ImageIcon, File as FileIcon, Loader2,
  CheckCircle2, AlertTriangle, Sparkles, ArrowRight, ShieldCheck,
} from "lucide-react";
import CaseStoryArc, { type ArcGap, type ArcNode } from "@/components/CaseStoryArc";
import type { ProjectSection } from "@/components/ProjectNav";

/**
 * Case intake — drop a stack of notices, watch the case assemble.
 *
 * This exists because there was no UI for the vision pipeline at all: PDFs,
 * photos, and DOCX could be read by the API, but nobody could reach that
 * capability without hand-crafting a request. That is the gap this closes.
 *
 * The design goal is not decoration — it is showing the user something true
 * that a plain file list cannot: the SHAPE of their case as it is built, in
 * real time, including the places the sequence looks compressed or
 * incomplete. See CaseStoryArc for why that shape is the point.
 *
 * Two calls, matching the backend's real rate limit (5 intake calls / 5 min):
 *   1. Upload everything at once (POST /evidence/upload, multi-file).
 *   2. Read everything at once (POST /cases/[id]/intake).
 * The reveal is staggered client-side for legibility — the network call is
 * real and singular; only the presentation of its (already complete) results
 * is paced out.
 */

type Phase = "idle" | "uploading" | "reading" | "revealing" | "done" | "error";

interface DroppedFile {
  file: File;
  id: string;
}

interface IntakeEventResult {
  evidenceId: string;
  eventDate: string;
  eventType: string;
  description: string;
  needsConfirmation: boolean;
  confirmationReason: string | null;
}

interface IntakeResponse {
  read: number;
  failures: { evidenceId: string; error: string }[];
  summary: string;
  arc: ArcNode[];
  events: IntakeEventResult[];
  eventsAdded: number;
  gaps: ArcGap[];
  confirmations: { evidenceId: string; fileName: string; fields: string[] }[];
  analysis: { score: number; summary: string; findingsCount: number; provisional: boolean } | null;
  nextStep: string;
}

const READING_MESSAGES = [
  "Reading service dates…",
  "Checking for hearing notices…",
  "Looking for appeal-rights language…",
  "Matching each document against the timeline…",
  "Cross-checking the escalation sequence…",
];

function iconFor(file: File) {
  if (file.type.startsWith("image/")) return ImageIcon;
  if (file.type === "application/pdf") return FileText;
  return FileIcon;
}

export default function CaseIntakePanel({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: (section: ProjectSection) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<DroppedFile[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cycle reassuring, honest status copy while the one real network call is
  // in flight. Never claims a specific document is done — we do not know that
  // until the whole response returns.
  useEffect(() => {
    if (phase !== "reading") return;
    const t = setInterval(() => setMessageIndex((i) => (i + 1) % READING_MESSAGES.length), 2200);
    return () => clearInterval(t);
  }, [phase]);

  // Stagger the reveal of already-complete results — a presentation pace,
  // not a fabricated progress signal.
  useEffect(() => {
    if (phase !== "revealing" || !result) return;
    const total = result.arc.length + result.gaps.length + 1;
    if (visibleCount >= total) {
      setPhase("done");
      return;
    }
    const t = setTimeout(() => setVisibleCount((v) => v + 1), 180);
    return () => clearTimeout(t);
  }, [phase, result, visibleCount]);

  const addFiles = useCallback((list: FileList | File[]) => {
    const next = Array.from(list).map((file) => ({
      file,
      id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
    }));
    setFiles((prev) => [...prev, ...next]);
  }, []);

  function removeFile(id: string) {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }

  async function run() {
    if (files.length === 0) return;
    setError(null);
    setPhase("uploading");

    try {
      const form = new FormData();
      form.set("projectId", projectId);
      for (const f of files) form.append("files", f.file);

      const uploadRes = await fetch("/api/v1/evidence/upload", {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (!uploadRes.ok) {
        const body = (await uploadRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Upload failed (${uploadRes.status})`);
      }
      const uploaded = (await uploadRes.json()) as { uploaded: number; ids: string[] };

      setPhase("reading");
      const intakeRes = await fetch(`/api/v1/cases/${projectId}/intake`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidenceIds: uploaded.ids }),
      });
      if (!intakeRes.ok) {
        const body = (await intakeRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Reading failed (${intakeRes.status})`);
      }
      const parsed = (await intakeRes.json()) as IntakeResponse;

      setResult(parsed);
      setVisibleCount(0);
      setPhase("revealing");
    } catch (err) {
      setError(String(err));
      setPhase("error");
    }
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setVisibleCount(0);
    setPhase("idle");
    setError(null);
  }

  // ── Idle: the drop zone ──
  if (phase === "idle") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-fp-text">Assemble the case</h2>
          <p className="text-sm text-fp-text-muted mt-2 max-w-2xl leading-relaxed">
            Drop every notice you have — photos, scans, PDFs, Word documents. Each one
            is read, placed on the timeline in order, and checked against the
            procedural rules. Nothing is added to the case record until you confirm it.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-12 text-center cursor-pointer transition-all ${
            dragging
              ? "border-fp-blue bg-fp-blue/[0.04] scale-[1.01]"
              : "border-fp-border hover:border-fp-border-hover hover:bg-fp-surface-2/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="application/pdf,image/*,.docx,.txt,.md,.csv"
            className="hidden"
            onChange={(e) => e.target.files && addFiles(e.target.files)}
          />
          <UploadCloud
            className={`w-9 h-9 mx-auto transition-colors ${dragging ? "text-fp-blue" : "text-fp-text-dim"}`}
          />
          <p className="text-sm font-medium text-fp-text mt-4">
            Drop notices here, or click to browse
          </p>
          <p className="text-xs text-fp-text-dim mt-1.5">
            PDF · JPG · PNG · DOCX · text — any mix, any order
          </p>
        </div>

        {files.length > 0 && (
          <div className="space-y-3 animate-[slide-up_0.24s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="fp-panel divide-y divide-fp-border">
              {files.map(({ file, id }) => {
                const Icon = iconFor(file);
                return (
                  <div key={id} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon className="w-4 h-4 text-fp-text-dim shrink-0" />
                    <span className="text-sm text-fp-text truncate flex-1">{file.name}</span>
                    <span className="text-xs text-fp-text-dim shrink-0">
                      {(file.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(id);
                      }}
                      className="text-xs text-fp-text-dim hover:text-fp-red transition-colors shrink-0"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-fp-text-dim">
                {files.length} document{files.length === 1 ? "" : "s"} ready
              </p>
              <button
                onClick={run}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
              >
                <Sparkles className="w-4 h-4" /> Read and assemble
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Uploading / reading: the one real wait ──
  if (phase === "uploading" || phase === "reading") {
    return (
      <div className="space-y-6">
        <div className="fp-panel p-10 text-center">
          <Loader2 className="w-8 h-8 text-fp-blue animate-spin mx-auto" />
          <p className="text-sm font-medium text-fp-text mt-4">
            {phase === "uploading"
              ? `Uploading ${files.length} document${files.length === 1 ? "" : "s"}…`
              : "Reading the case file…"}
          </p>
          {phase === "reading" && (
            <p className="text-xs text-fp-text-dim mt-2 h-4 transition-opacity">
              {READING_MESSAGES[messageIndex]}
            </p>
          )}
          <p className="text-xs text-fp-text-dim mt-4 max-w-sm mx-auto leading-relaxed">
            Larger stacks take longer — a model reads each document individually so
            dates and case numbers are transcribed accurately, not guessed.
          </p>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (phase === "error") {
    return (
      <div className="space-y-4">
        <div className="fp-panel border-fp-red/30 bg-fp-red/[0.04] p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-fp-red shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-fp-red">Something went wrong</p>
              <p className="text-xs text-fp-text-muted mt-1.5">{error}</p>
            </div>
          </div>
        </div>
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-fp-surface-2 text-sm font-medium text-fp-text hover:bg-fp-surface-2/70 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  // ── Revealing / done: the payoff ──
  if (result) {
    const showSummary = visibleCount >= 1;
    const arcVisible = visibleCount >= 1;
    const gapsRevealed = Math.max(0, visibleCount - result.arc.length - 1);
    const revealedGaps = result.gaps.slice(0, gapsRevealed);

    return (
      <div className="space-y-6">
        {showSummary && (
          <div className="fp-panel p-6 border-fp-green/30 bg-fp-green/[0.03] animate-[slide-up_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-fp-green shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-fp-text">{result.summary}</p>
                {result.confirmations.length > 0 && (
                  <p className="text-xs text-fp-amber mt-2 leading-relaxed">
                    {result.confirmations.length} document
                    {result.confirmations.length === 1 ? "" : "s"} need a field confirmed
                    against the original before its date is relied on.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {arcVisible && result.arc.length > 0 && (
          <div className="animate-[slide-up_0.3s_cubic-bezier(0.16,1,0.3,1)]">
            <CaseStoryArc arc={result.arc} gaps={revealedGaps} />
          </div>
        )}

        {result.failures.length > 0 && phase === "done" && (
          <div className="fp-panel border-fp-amber/30 bg-fp-amber/[0.04] p-4">
            <p className="text-xs font-medium text-fp-amber">
              {result.failures.length} document{result.failures.length === 1 ? "" : "s"} could
              not be read
            </p>
            <ul className="mt-2 space-y-1">
              {result.failures.map((f, i) => (
                <li key={i} className="text-xs text-fp-text-muted">{f.error}</li>
              ))}
            </ul>
          </div>
        )}

        {phase === "done" && (
          <div className="flex items-center gap-3 flex-wrap animate-[fade-in_0.3s_ease-out]">
            {result.analysis && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fp-surface-2 text-xs text-fp-text-dim">
                <ShieldCheck className="w-3.5 h-3.5" />
                {result.analysis.findingsCount} procedural checkpoint
                {result.analysis.findingsCount === 1 ? "" : "s"} flagged
                {result.analysis.provisional && " · provisional"}
              </div>
            )}
            <button
              onClick={() => onNavigate?.("timeline" as ProjectSection)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-fp-border text-sm font-medium text-fp-text hover:bg-fp-surface-2 transition-colors"
            >
              View timeline
            </button>
            <button
              onClick={() => onNavigate?.("analysis" as ProjectSection)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
            >
              {result.nextStep} <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={reset}
              className="text-xs text-fp-text-dim hover:text-fp-text transition-colors ml-auto"
            >
              Add more documents
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
