"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Clock, CheckCircle2, HelpCircle, ChevronDown, ExternalLink } from "lucide-react";

/**
 * The clock.
 *
 * This is the most important element in the product. A person holding an
 * abatement notice has one question before any other — how long do I have — and
 * the answer determines whether the rest of the case matters at all. More
 * matters are lost on the calendar than on the merits.
 *
 * Design decisions, all downstream of that:
 *
 *   - It is never a number in a stats strip. The day count is the largest type
 *     on the page when the window is closing, and the bar changes color as it
 *     tightens. Urgency should be legible from across a room.
 *   - "Unknown" is styled as a warning, not as calm. A deadline we cannot
 *     compute is the most dangerous state, not the most relaxed one, and
 *     rendering it in neutral grey would be a lie told in CSS.
 *   - The citation is always one click away. A date without an authority is a
 *     number someone made up, and this product's whole claim is that it does
 *     not do that.
 *   - A passed deadline still renders. Hiding it would hide the single fact
 *     most likely to change what someone does next.
 */

interface Deadline {
  ruleId: string | null;
  label: string;
  dueDate: string | null;
  daysRemaining: number | null;
  confidence: "verified" | "provisional" | "unknown";
  citation: string | null;
  sourceUrl: string | null;
  basis: string;
  caveats: string[];
  sourceLabel?: string;
  serviceDate?: string;
  urgency?: "passed" | "critical" | "urgent" | "upcoming" | "unknown";
  message?: string;
}

interface DeadlineResponse {
  deadlines: Deadline[];
  primary: Deadline | null;
  openCount: number;
  passedCount: number;
  provisional: boolean;
  note: string | null;
}

type Urgency = NonNullable<Deadline["urgency"]>;

/**
 * Palette per urgency.
 *
 * `unknown` deliberately borrows the amber treatment rather than a neutral one:
 * not knowing a deadline is a call to action, not an absence of one.
 */
const URGENCY_STYLES: Record<Urgency, {
  bar: string; accent: string; text: string; chip: string; icon: typeof Clock;
}> = {
  passed: {
    bar: "border-fp-red/40 bg-fp-red/[0.06]",
    accent: "bg-fp-red",
    text: "text-fp-red",
    chip: "bg-fp-red/10 text-fp-red border-fp-red/25",
    icon: AlertTriangle,
  },
  critical: {
    bar: "border-fp-red/40 bg-fp-red/[0.06]",
    accent: "bg-fp-red",
    text: "text-fp-red",
    chip: "bg-fp-red/10 text-fp-red border-fp-red/25",
    icon: AlertTriangle,
  },
  urgent: {
    bar: "border-fp-amber/40 bg-fp-amber/[0.06]",
    accent: "bg-fp-amber",
    text: "text-fp-amber",
    chip: "bg-fp-amber/10 text-fp-amber border-fp-amber/25",
    icon: Clock,
  },
  upcoming: {
    bar: "border-fp-border bg-fp-surface",
    accent: "bg-fp-blue",
    text: "text-fp-text",
    chip: "bg-fp-blue/10 text-fp-blue border-fp-blue/25",
    icon: Clock,
  },
  unknown: {
    bar: "border-fp-amber/40 bg-fp-amber/[0.06]",
    accent: "bg-fp-amber",
    text: "text-fp-amber",
    chip: "bg-fp-amber/10 text-fp-amber border-fp-amber/25",
    icon: HelpCircle,
  },
};

function headline(d: Deadline): { big: string; small: string } {
  if (d.daysRemaining === null) {
    return { big: "Unknown", small: "response window" };
  }
  if (d.daysRemaining < 0) {
    const n = Math.abs(d.daysRemaining);
    return { big: `${n}`, small: `day${n === 1 ? "" : "s"} past the window` };
  }
  if (d.daysRemaining === 0) return { big: "Today", small: "is the last day" };
  return { big: `${d.daysRemaining}`, small: `day${d.daysRemaining === 1 ? "" : "s"} to respond` };
}

export default function DeadlineBar({
  caseId,
  onOpenWorkflow,
}: {
  caseId: string;
  onOpenWorkflow?: () => void;
}) {
  const [data, setData] = useState<DeadlineResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/cases/${caseId}/deadlines`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const json = (await res.json()) as DeadlineResponse;
        if (!cancelled) setData(json);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (loading) {
    return <div className="h-[76px] rounded-[10px] shimmer" aria-hidden />;
  }

  // No notice on file. Say what to do about it rather than rendering nothing —
  // an absent bar reads as "no deadline", which is the wrong inference.
  if (!data?.primary) {
    return (
      <div className="fp-panel px-5 py-4 flex items-start gap-3 border-fp-amber/40 bg-fp-amber/[0.06]">
        <HelpCircle className="w-5 h-5 text-fp-amber shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-fp-amber">No response deadline can be computed</p>
          <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">
            {data?.note ??
              "No notice with a service date is on this case. If a notice was received, add it to the timeline — the response window may already be running."}
          </p>
        </div>
      </div>
    );
  }

  const d = data.primary;
  const urgency: Urgency = d.urgency ?? "unknown";
  const s = URGENCY_STYLES[urgency];
  const Icon = s.icon;
  const { big, small } = headline(d);
  const loud = urgency === "critical" || urgency === "passed";

  return (
    <div className={`fp-panel overflow-hidden border ${s.bar} animate-[slide-up_0.28s_cubic-bezier(0.16,1,0.3,1)]`}>
      <div className="flex">
        {/* Urgency spine — color legible before any text is read. */}
        <div className={`w-1 shrink-0 ${s.accent}`} aria-hidden />

        <div className="flex-1 min-w-0 px-5 py-4">
          <div className="flex items-start gap-5 flex-wrap">
            {/* The number. Deliberately oversized when time is short. */}
            <div className="flex items-baseline gap-2 shrink-0">
              <span
                className={`font-semibold tracking-tight tabular-nums ${s.text} ${
                  loud ? "text-4xl" : "text-3xl"
                }`}
              >
                {big}
              </span>
              <span className="text-sm font-medium text-fp-text-muted">{small}</span>
            </div>

            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <Icon className={`w-4 h-4 shrink-0 ${s.text}`} />
                <span className="text-sm font-medium text-fp-text">{d.label}</span>
                {d.dueDate && (
                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-medium border ${s.chip}`}>
                    Due {d.dueDate}
                  </span>
                )}
                {d.confidence === "provisional" && (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-medium border bg-fp-amber/10 text-fp-amber border-fp-amber/25">
                    Provisional
                  </span>
                )}
              </div>
              {d.message && (
                <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed">{d.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {onOpenWorkflow && (
                <button
                  onClick={onOpenWorkflow}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    loud
                      ? "bg-fp-red text-white hover:bg-fp-red/90"
                      : "bg-fp-blue text-white hover:bg-fp-blue/90"
                  }`}
                >
                  Respond
                </button>
              )}
              <button
                onClick={() => setExpanded(!expanded)}
                className="p-2 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
                aria-label={expanded ? "Hide deadline detail" : "Show deadline detail"}
                aria-expanded={expanded}
              >
                <ChevronDown
                  className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            </div>
          </div>

          {expanded && (
            <div className="mt-4 pt-4 border-t border-fp-border/70 space-y-4 animate-[fade-in_0.2s_ease-out]">
              <div>
                <div className="fp-eyebrow mb-1.5">How this date was reached</div>
                <p className="text-sm text-fp-text-muted leading-relaxed">{d.basis}</p>
                {d.sourceUrl && (
                  <a
                    href={d.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-fp-blue hover:underline mt-2"
                  >
                    Read {d.citation} <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {d.caveats.length > 0 && (
                <div>
                  <div className="fp-eyebrow mb-1.5">What could make this wrong</div>
                  <ul className="space-y-1.5">
                    {d.caveats.map((c, i) => (
                      <li key={i} className="flex gap-2 text-xs text-fp-text-muted leading-relaxed">
                        <span className="text-fp-text-dim shrink-0">·</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.deadlines.length > 1 && (
                <div>
                  <div className="fp-eyebrow mb-2">
                    Other windows on this case ({data.deadlines.length - 1})
                  </div>
                  <div className="space-y-1.5">
                    {data.deadlines.slice(1).map((o, i) => {
                      const os = URGENCY_STYLES[o.urgency ?? "unknown"];
                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between gap-4 text-xs py-1.5 px-3 rounded-lg bg-fp-surface-2/60"
                        >
                          <span className="text-fp-text-muted truncate">{o.label}</span>
                          <span className={`font-medium tabular-nums shrink-0 ${os.text}`}>
                            {o.dueDate}
                            {o.daysRemaining !== null && (
                              <span className="text-fp-text-dim font-normal ml-2">
                                {o.daysRemaining >= 0
                                  ? `${o.daysRemaining}d`
                                  : `${Math.abs(o.daysRemaining)}d ago`}
                              </span>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {data.passedCount > 0 && (
                <p className="text-xs text-fp-text-dim leading-relaxed">
                  {data.passedCount} window{data.passedCount === 1 ? " has" : "s have"} already
                  closed. A late response may still be worth filing — that is a question for
                  counsel, not a reason to stop.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact variant for case lists — same logic, one line. */
export function DeadlinePill({ deadline }: { deadline: Deadline | null }) {
  if (!deadline?.dueDate) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border bg-fp-amber/10 text-fp-amber border-fp-amber/25">
        <HelpCircle className="w-3 h-3" /> No deadline computed
      </span>
    );
  }
  const s = URGENCY_STYLES[deadline.urgency ?? "unknown"];
  const Icon = deadline.urgency === "upcoming" ? CheckCircle2 : s.icon;
  const d = deadline.daysRemaining;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border tabular-nums ${s.chip}`}
    >
      <Icon className="w-3 h-3" />
      {d === null ? "Unknown" : d < 0 ? `${Math.abs(d)}d overdue` : `${d}d left`}
    </span>
  );
}
