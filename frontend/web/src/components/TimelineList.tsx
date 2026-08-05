"use client";

import type { TimelineEntry } from "@/lib/graph/types";

interface Props {
  events: TimelineEntry[];
  selectedEvent: string | null;
  onEventClick: (entry: TimelineEntry) => void;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-l-fp-red",
  warning: "border-l-fp-amber",
  info: "border-l-fp-blue",
};

const ACTOR_ICONS: Record<string, string> = {
  human: "👤",
  agent: "🤖",
  system: "⚙",
  government_source: "🏛",
};

export default function TimelineList({ events, selectedEvent, onEventClick }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-fp-text-dim text-sm py-8">
        No timeline events yet
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
      {events.map((entry) => {
        const isSelected = selectedEvent === entry.id;
        const severityClass = SEVERITY_STYLES[entry.severity] || SEVERITY_STYLES.info;

        return (
          <button
            key={entry.id}
            onClick={() => onEventClick(entry)}
            className={`w-full text-left p-2.5 rounded-lg border-l-2 transition-all ${
              isSelected
                ? "bg-fp-blue/10 " + severityClass
                : "hover:bg-fp-surface-2 " + severityClass + " border-l-transparent"
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-fp-text-dim font-mono">{entry.date}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-fp-surface-2 text-fp-text-muted">
                {ACTOR_ICONS[entry.actor.type] || "•"} {entry.actor.type}
              </span>
              {entry.agent_version && (
                <span className="text-[10px] text-fp-purple">v{entry.agent_version}</span>
              )}
            </div>
            <div className="text-sm text-fp-text font-medium leading-tight">
              {entry.type_label}
            </div>
            {entry.description && (
              <div className="text-xs text-fp-text-dim mt-0.5 line-clamp-2">
                {entry.description}
              </div>
            )}
            {entry.evidence_id && (
              <div className="text-[10px] text-fp-cyan mt-1">
                📎 Evidence: {entry.evidence_id.slice(0, 8)}…
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
