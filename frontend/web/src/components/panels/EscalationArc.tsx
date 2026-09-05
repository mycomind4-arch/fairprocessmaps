"use client";

/**
 * Visual escalation arc for the case timeline.
 *
 * A flat list of dated cards makes you read every entry to notice that the
 * hearing never happened, or that the penalty landed four days after the
 * notice. This puts the same events on a rail ordered by procedural
 * severity, not just by date, so a skipped rung or a compressed interval is
 * something you see at a glance instead of something you have to compute in
 * your head while scrolling.
 *
 * Deliberately neutral: this observes gaps and short intervals in what's on
 * record. It never says a step was required or that anyone did anything
 * wrong — see docs/policy-packs.md for why that line matters here.
 */

import { useMemo } from "react";
import { AlertTriangle, Flag } from "lucide-react";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
}

/** Escalation ladder for the timeline's own event-type vocabulary (see
 * EVENT_TYPES in TimelinePanel.tsx). Lower number = earlier in a typical
 * enforcement arc. Types absent here (correspondence, evidence_uploaded,
 * intelligence_gathered, project_created, other) render as unranked dots —
 * they're on the case, just not part of the escalation ladder itself. */
const RUNG: Record<string, number> = {
  inspection: 0,
  notice_sent: 1,
  abatement: 2,
  hearing_held: 3,
  decision: 4,
  fine_imposed: 5,
  lien_filed: 6,
};

const RUNG_LABEL: Record<string, string> = {
  inspection: "Inspection",
  notice_sent: "Notice",
  abatement: "Abatement",
  hearing_held: "Hearing",
  decision: "Decision",
  fine_imposed: "Penalty",
  lien_filed: "Lien",
};

/** Milestones that matter but aren't a rung of severity in themselves. */
const MILESTONE_TYPES = new Set(["deadline", "appeal_filed"]);

interface Gap {
  afterId: string;
  beforeId: string;
  kind: "missing_rung" | "compressed_interval" | "no_hearing_before_penalty";
  description: string;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

export default function EscalationArc({ items }: { items: TimelineItem[] }) {
  const { ranked, unranked, gaps } = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.event_date.localeCompare(b.event_date));
    const ranked = sorted.filter((i) => i.event_type in RUNG || MILESTONE_TYPES.has(i.event_type));
    const unranked = sorted.filter((i) => !(i.event_type in RUNG) && !MILESTONE_TYPES.has(i.event_type));

    const rungOnly = ranked.filter((i) => i.event_type in RUNG);
    const gaps: Gap[] = [];

    for (let i = 1; i < rungOnly.length; i++) {
      const prev = rungOnly[i - 1];
      const cur = rungOnly[i];
      const jump = RUNG[cur.event_type] - RUNG[prev.event_type];
      const gapDays = daysBetween(prev.event_date, cur.event_date);

      if (jump > 1) {
        gaps.push({
          afterId: prev.id,
          beforeId: cur.id,
          kind: "missing_rung",
          description: `${RUNG_LABEL[prev.event_type]} moves directly to ${RUNG_LABEL[cur.event_type]} — the usual intermediate step isn't on this timeline.`,
        });
      }
      if (jump > 0 && gapDays >= 0 && gapDays < 5) {
        gaps.push({
          afterId: prev.id,
          beforeId: cur.id,
          kind: "compressed_interval",
          description: `Only ${gapDays} day${gapDays === 1 ? "" : "s"} between ${RUNG_LABEL[prev.event_type]} and ${RUNG_LABEL[cur.event_type]}.`,
        });
      }
    }

    const firstPenalty = rungOnly.find((i) => i.event_type === "fine_imposed" || i.event_type === "lien_filed");
    if (firstPenalty) {
      const hearingBefore = rungOnly.some(
        (i) => i.event_type === "hearing_held" && i.event_date <= firstPenalty.event_date,
      );
      if (!hearingBefore) {
        gaps.push({
          afterId: firstPenalty.id,
          beforeId: firstPenalty.id,
          kind: "no_hearing_before_penalty",
          description: `${RUNG_LABEL[firstPenalty.event_type]} on ${firstPenalty.event_date} has no hearing recorded before it on this timeline.`,
        });
      }
    }

    return { ranked, unranked, gaps };
  }, [items]);

  const gapsFor = (id: string) => gaps.filter((g) => g.afterId === id || g.beforeId === id);

  if (ranked.length === 0) {
    return null;
  }

  return (
    <div className="surface-flat rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-fp-text">Escalation Arc</h2>
        {gaps.length > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-fp-amber/15 text-fp-amber border border-fp-amber/30 font-medium">
            {gaps.length} observation{gaps.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-0 min-w-max px-1">
          {ranked.map((item, i) => {
            const isMilestone = MILESTONE_TYPES.has(item.event_type);
            const label = isMilestone
              ? item.event_type === "deadline" ? "Deadline" : "Appeal"
              : RUNG_LABEL[item.event_type];
            const itemGaps = gapsFor(item.id);
            const hasWarning = itemGaps.length > 0;

            return (
              <div key={item.id} className="flex items-start">
                <div className="flex flex-col items-center w-28 shrink-0">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                      isMilestone
                        ? "border-fp-blue bg-fp-blue/10 text-fp-blue"
                        : hasWarning
                          ? "border-fp-red bg-fp-red/10 text-fp-red"
                          : "border-fp-green bg-fp-green/10 text-fp-green"
                    }`}
                    title={item.description ?? label}
                  >
                    {isMilestone ? <Flag className="w-3.5 h-3.5" /> : hasWarning ? <AlertTriangle className="w-3.5 h-3.5" /> : <span className="text-xs font-bold">{i + 1}</span>}
                  </div>
                  <span className="text-xs font-medium text-fp-text mt-2 text-center">{label}</span>
                  <span className="text-[10px] text-fp-text-dim tabular-nums">{item.event_date}</span>
                </div>

                {i < ranked.length - 1 && (
                  <div className="flex flex-col items-center justify-center pt-4 -mx-2 relative" style={{ width: 40 }}>
                    <div className={`h-0.5 w-full ${hasWarning || gapsFor(ranked[i + 1].id).length > 0 ? "bg-fp-red/50" : "bg-fp-border"}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {gaps.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-fp-border pt-3">
          {gaps.map((g, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-fp-text-muted">
              <AlertTriangle className="w-3.5 h-3.5 text-fp-amber shrink-0 mt-0.5" />
              <span>{g.description}</span>
            </li>
          ))}
        </ul>
      )}

      {unranked.length > 0 && (
        <p className="text-[11px] text-fp-text-dim mt-3">
          {unranked.length} other record{unranked.length === 1 ? "" : "s"} on this case ({unranked.map((u) => u.event_type.replace(/_/g, " ")).join(", ")}) aren't part of the escalation ladder — see the full list below.
        </p>
      )}
    </div>
  );
}
