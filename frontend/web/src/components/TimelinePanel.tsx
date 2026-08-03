"use client";

import { useEffect, useRef, useState } from "react";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data/standalone";
import { Loader2, Calendar } from "lucide-react";
import "vis-timeline/styles/vis-timeline-graph2d.css";
import { api, ApiError } from "@/lib/api";
import type { TimelineEvent } from "@/lib/types";

interface TimelinePanelProps {
  propertyId: string | null;
  refreshKey?: number;
}

export default function TimelinePanel({ propertyId, refreshKey }: TimelinePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) { setEvents([]); return; }
    setLoading(true);
    setError(null);
    api.timeline
      .get(propertyId)
      .then(setEvents)
      .catch((e: ApiError) => setError(e.detail || "Failed to load timeline"))
      .finally(() => setLoading(false));
  }, [propertyId, refreshKey]);

  useEffect(() => {
    if (!containerRef.current || loading) return;
    const items = new DataSet(
      events.map((e, i) => ({
        id: i,
        content: e.title,
        start: e.event_date,
        type: "point",
        className: e.is_due_process_critical ? "vis-item vis-dot vis-item-critical" : "vis-item vis-dot",
      }))
    );
    if (timelineRef.current) {
      timelineRef.current.setItems(items);
    } else if (events.length > 0) {
      timelineRef.current = new Timeline(containerRef.current, items, {
        height: "260px",
        start: events[0].event_date,
        end: events[events.length - 1].event_date,
        margin: { item: 12 },
        stack: true,
        showCurrentTime: true,
      });
    }
    return () => { timelineRef.current?.destroy(); timelineRef.current = null; };
  }, [events, loading]);

  if (!propertyId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-3">
            <Calendar className="w-7 h-7 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">Select a property to view timeline</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden animate-[fade-in_0.3s_ease-out]">
      <div className="px-4 py-3 flex items-center justify-between shrink-0">
        <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Timeline</h2>
        {events.length > 0 && <span className="text-xs text-fp-text-dim tabular-nums">{events.length} event{events.length !== 1 ? "s" : ""}</span>}
      </div>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-fp-text-dim animate-spin" />
        </div>
      )}
      {error && !loading && (
        <div className="m-4 p-3 text-sm text-fp-red glass rounded-xl flex items-center gap-2">{error}</div>
      )}
      {!loading && !error && events.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-3">
            <Calendar className="w-7 h-7 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">No timeline events yet</p>
        </div>
      )}
      <div ref={containerRef} className="w-full px-2 flex-1" />
    </div>
  );
}
