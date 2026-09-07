"use client";

import { useState } from "react";
import { AlertTriangle, HelpCircle, FileQuestion, ChevronRight } from "lucide-react";

/**
 * The case story arc.
 *
 * Nobody reading a stack of enforcement paperwork sees the thing that actually
 * matters: the SHAPE of the escalation, and where it moved faster or skipped
 * further than the pattern usually does. A due-process problem is rarely
 * inside one document — it lives in the gap between two of them. A list of
 * files does not show that. A line does.
 *
 * So this renders the documents as beads on a timeline, in the order the case
 * actually moved, and turns each interval between them into a segment that can
 * carry its own observation — amber for something worth noticing, red for
 * something that reads as compressed or unusual, quiet when nothing does.
 *
 * This is intentionally the same neutral posture as the rest of the product:
 * a colored segment is a prompt to look, not a verdict. Clicking it shows
 * exactly what the case-builder observed and what to do about it — never a
 * conclusion about whether anyone broke the law.
 */

export interface ArcNode {
  evidenceId: string;
  documentType: string;
  date: string | null;
}

export interface ArcGap {
  kind: string;
  severity: "high" | "medium" | "low";
  description: string;
  evidenceIds: string[];
  suggestedNextStep: string;
}

const SEVERITY_DOT: Record<string, string> = {
  high: "bg-fp-red border-fp-red",
  medium: "bg-fp-amber border-fp-amber",
  low: "bg-fp-blue border-fp-blue",
};

const SEVERITY_LINE: Record<string, string> = {
  high: "bg-fp-red/70",
  medium: "bg-fp-amber/70",
  low: "bg-fp-blue/50",
};

function label(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

/** A gap touching both endpoints of one interval — the thing to render on that segment. */
function gapForPair(gaps: ArcGap[], a: string, b: string): ArcGap | null {
  return (
    gaps.find(
      (g) => g.evidenceIds.includes(a) && g.evidenceIds.includes(b) && g.evidenceIds.length <= 2,
    ) ?? null
  );
}

/** A gap about one document alone (e.g. undated) rather than an interval. */
function gapForNode(gaps: ArcGap[], id: string): ArcGap | null {
  return gaps.find((g) => g.evidenceIds.length === 1 && g.evidenceIds[0] === id) ?? null;
}

export default function CaseStoryArc({ arc, gaps }: { arc: ArcNode[]; gaps: ArcGap[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (arc.length === 0) return null;

  return (
    <div className="fp-panel p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-medium text-fp-text">The case, in order</h3>
        <span className="text-xs text-fp-text-dim">
          {arc.length} document{arc.length === 1 ? "" : "s"}
          {gaps.length > 0 && ` · ${gaps.length} observation${gaps.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <p className="text-xs text-fp-text-muted mb-6 max-w-xl leading-relaxed">
        Every notice, placed in the order it happened. A colored segment marks an
        interval worth a second look — hover the dot for what was observed and
        what to do about it. This is a prompt to check, not a conclusion.
      </p>

      {/* Horizontal on wide screens, a vertical spine on narrow ones. */}
      <div className="relative overflow-x-auto scrollbar-thin pb-2">
        <div className="flex items-start min-w-max sm:min-w-0" style={{ minWidth: arc.length > 1 ? `${arc.length * 168}px` : undefined }}>
          {arc.map((node, i) => {
            const nodeGap = gapForNode(gaps, node.evidenceId);
            const nextGap = i < arc.length - 1 ? gapForPair(gaps, node.evidenceId, arc[i + 1].evidenceId) : null;
            const isOpen = openId === node.evidenceId;

            return (
              <div key={node.evidenceId} className="relative flex-1 flex flex-col items-center min-w-[140px]">
                {/* Connector to the next node — drawn first so the dot sits on top. */}
                {i < arc.length - 1 && (
                  <div className="absolute top-[15px] left-1/2 w-full h-0.5 z-0">
                    <div
                      className={`h-full ${nextGap ? SEVERITY_LINE[nextGap.severity] : "bg-fp-border"}`}
                    />
                  </div>
                )}

                {/* The dot */}
                <button
                  onClick={() => setOpenId(isOpen ? null : node.evidenceId)}
                  className="relative z-10 group p-2 -m-2"
                  aria-label={`${label(node.documentType)}${node.date ? ` — ${node.date}` : ""}`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full border-2 transition-transform group-hover:scale-125 ${
                      nodeGap
                        ? SEVERITY_DOT[nodeGap.severity]
                        : "bg-fp-surface border-fp-blue"
                    }`}
                  />
                  {nodeGap && (
                    <HelpCircle className="w-3 h-3 text-white absolute inset-0 m-auto" strokeWidth={3} />
                  )}
                </button>

                {/* Interval days, shown between the dots along the connector. */}
                {i < arc.length - 1 && node.date && arc[i + 1].date && (
                  <button
                    onClick={() => nextGap && setOpenId(isOpen && openId === node.evidenceId ? null : node.evidenceId)}
                    className={`absolute top-2 left-[calc(50%+20px)] z-10 text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
                      nextGap
                        ? nextGap.severity === "high"
                          ? "bg-fp-red/10 text-fp-red"
                          : "bg-fp-amber/10 text-fp-amber"
                        : "text-fp-text-dim"
                    }`}
                  >
                    {daysBetween(node.date, arc[i + 1].date!)}d
                  </button>
                )}

                {/* Label */}
                <div className="mt-3 text-center px-1">
                  <div className="text-[11px] font-medium text-fp-text leading-snug">
                    {label(node.documentType)}
                  </div>
                  <div className="text-[10px] text-fp-text-dim mt-0.5">
                    {node.date ?? (
                      <span className="inline-flex items-center gap-1 text-fp-amber">
                        <FileQuestion className="w-2.5 h-2.5" /> undated
                      </span>
                    )}
                  </div>
                </div>

                {/* Expanded observation for this node's own gap (e.g. undated). */}
                {isOpen && nodeGap && (
                  <ObservationCard gap={nodeGap} />
                )}

                {/* Expanded observation for the interval to the right, anchored under this node. */}
                {isOpen && nextGap && !nodeGap && (
                  <ObservationCard gap={nextGap} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ObservationCard({ gap }: { gap: ArcGap }) {
  const tone =
    gap.severity === "high"
      ? "border-fp-red/30 bg-fp-red/[0.05]"
      : gap.severity === "medium"
        ? "border-fp-amber/30 bg-fp-amber/[0.05]"
        : "border-fp-blue/30 bg-fp-blue/[0.05]";
  const iconTone = gap.severity === "high" ? "text-fp-red" : gap.severity === "medium" ? "text-fp-amber" : "text-fp-blue";

  return (
    <div
      className={`absolute top-full mt-3 w-56 rounded-lg border p-3 text-left z-20 shadow-lg animate-[scale-in_0.15s_cubic-bezier(0.16,1,0.3,1)] ${tone}`}
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${iconTone}`} />
        <p className="text-[11px] text-fp-text leading-relaxed">{gap.description}</p>
      </div>
      <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-fp-border/50">
        <ChevronRight className="w-3 h-3 text-fp-text-dim shrink-0 mt-0.5" />
        <p className="text-[11px] text-fp-text-muted leading-relaxed">{gap.suggestedNextStep}</p>
      </div>
    </div>
  );
}
