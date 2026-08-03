"use client";

import { useEffect, useRef, useState } from "react";
import { Timeline } from "vis-timeline/standalone";
import { DataSet } from "vis-data/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.css";

interface TimelinePanelProps {
  propertyId: string | null;
}

export default function TimelinePanel({ propertyId }: TimelinePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<Timeline | null>(null);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!propertyId) {
      setEvents([]);
      return;
    }
    fetch(`/api/v1/timeline/${propertyId}`)
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => {});
  }, [propertyId]);

  useEffect(() => {
    if (!containerRef.current) return;

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
    } else {
      timelineRef.current = new Timeline(containerRef.current, items, {
        height: "240px",
        start: events.length > 0 ? events[0].event_date : new Date(),
        end: events.length > 0 ? events[events.length - 1].event_date : new Date(),
      });
    }

    return () => {
      timelineRef.current?.destroy();
      timelineRef.current = null;
    };
  }, [events]);

  if (!propertyId) return null;

  return (
    <div className="border-t border-fp-gray-200 bg-white shrink-0">
      <div className="px-4 py-2 border-b border-fp-gray-100">
        <h2 className="text-sm font-semibold text-fp-gray-700 uppercase tracking-wide">
          Timeline
        </h2>
      </div>
      <div ref={containerRef} className="w-full" />
    </div>
  );
}
