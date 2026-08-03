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
    if (!propertyId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    setError(null);
    api.timeline
      .get(propertyId)
      .then((data) => {
        setEvents(data);
      })
      .catch((e: ApiError) => {
        setError(e.detail || "Failed to load timeline");
      })
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
        className: e.is_due_process_critical
          ? "vis-item vis-dot vis-item-critical"
          : "vis-item vis-dot",
      }))
    );

    if (timelineRef.current) {
      timelineRef.current.setItems(items);
    } else if (events.length > 0) {
      timelineRef.current = new Timeline(containerRef.current, items, {
        height: "240px",
        start: events[0].event_date,
        end: events[events.length - 1].event_date,
        margin: { item: 10 },
      });
    }

    return () => {
      timelineRef.current?.destroy();
      timelineRef.current = null;
    };
  }, [events, loading]);

  if (!propertyId) return null;

  return (
    <div className="border-t border-fp-gray-200 bg-white shrink-0">
      <div className="px-4 py-2 border-b border-fp-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fp-gray-700 uppercase tracking-wide">
          Timeline
        </h2>
        {events.length > 0 && (
          <span className="text-xs text-fp-gray-400">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-fp-gray-400 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="p-3 text-xs text-fp-red">{error}</div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="text-center py-6 text-fp-gray-400">
          <Calendar className="w-6 h-6 mx-auto mb-1 opacity-50" />
          <p className="text-xs">No timeline events yet</p>
        </div>
      )}

      <div ref={containerRef} className="w-full" />
    </div>
  );
}
