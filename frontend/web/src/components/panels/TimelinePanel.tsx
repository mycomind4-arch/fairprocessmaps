"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2, AlertCircle, RefreshCw } from "lucide-react";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_title: string | null;
}

function eventTypeColor(type: string) {
  const colors: Record<string, string> = {
    notice_sent: "bg-fp-blue",
    hearing_held: "bg-fp-cyan",
    appeal_filed: "bg-fp-purple",
    deadline: "bg-fp-red",
    correspondence: "bg-fp-text-dim",
    inspection: "bg-fp-amber",
    decision: "bg-fp-green",
  };
  return colors[type] ?? "bg-fp-text-dim";
}

export default function TimelinePanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/timeline?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { items?: TimelineItem[] } = await res.json();
      setItems(json.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  return (
    <div className="space-y-5 pb-8 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fp-text">Timeline</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">Chronological case events</p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-2 top-2 bottom-2 w-px bg-fp-border" />
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="relative">
                {/* Dot */}
                <div className={`absolute -left-[18px] top-3 w-3 h-3 rounded-full ${eventTypeColor(item.event_type)} ring-4 ring-fp-bg`} />
                <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-fp-text">
                      {item.event_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-fp-text-dim">{item.event_date}</span>
                  </div>
                  {item.description && (
                    <p className="text-sm text-fp-text-muted mt-1">{item.description}</p>
                  )}
                  {item.evidence_title && (
                    <div className="text-[11px] text-fp-text-dim mt-2">
                      Source: {item.evidence_title}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-12 text-center">
          <Calendar className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No timeline events</h3>
          <p className="text-xs text-fp-text-dim mt-1">
            Events appear here as evidence is processed and analyzed.
          </p>
        </div>
      )}
    </div>
  );
}
