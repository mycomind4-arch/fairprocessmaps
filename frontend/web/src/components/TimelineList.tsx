"use client";

import type { TimelineEntry } from "@/lib/graph/types";
import { FileText, Bot, Server, Building2 } from "lucide-react";

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

const ACTOR_ICONS: Record<string, typeof FileText> = {
  human: FileText,
  agent: Bot,
  system: Server,
  government_source: Building2,
};

export default function TimelineList({ events, selectedEvent, onEventClick }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-16 px-6 text-center">
        <FileText className="w-8 h-8 text-fp-text-dim mx-auto mb-4" />
        <h3 className="text-sm font-medium text-fp-text">No timeline events yet</h3>
        <p className="text-xs text-fp-text-dim mt-2 max-w-xs">
          Timeline events are generated automatically as evidence and enforcement actions are recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {events.map((entry) => {
        const isSelected = selectedEvent === entry.id;
        const severityClass = SEVERITY_STYLES[entry.severity] || SEVERITY_STYLES.info;
        const ActorIcon = ACTOR_ICONS[entry.actor.type] || FileText;

        return (
          <button
            key={entry.id}
            onClick={() => onEventClick(entry)}
            className={`w-full text-left p-4 rounded-[14px] border-l-4 transition-all duration-200 ${
              isSelected
                ? "bg-fp-blue/10 " + severityClass + " shadow-lg shadow-black/20"
                : "hover:bg-fp-surface-2 " + severityClass + " border-l-transparent hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-fp-text-dim font-mono">{entry.date}</span>
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg bg-fp-surface-2 text-fp-text-muted">
                <ActorIcon className="w-3 h-3" />
                {entry.actor.type}
              </span>
              {entry.agent_version && (
                <span className="text-xs text-fp-text-dim">v{entry.agent_version}</span>
              )}
            </div>
            <div className="text-sm text-fp-text font-medium leading-tight">
              {entry.type_label}
            </div>
            {entry.description && (
              <div className="text-xs text-fp-text-dim mt-1 line-clamp-2">
                {entry.description}
              </div>
            )}
            {entry.evidence_id && (
              <div className="flex items-center gap-1 text-xs text-fp-blue mt-2">
                <FileText className="w-3 h-3" />
                Evidence: {entry.evidence_id.slice(0, 8)}…
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
