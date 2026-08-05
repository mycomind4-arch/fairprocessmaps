"use client";

import { useEffect, useState } from "react";
import {
  Calendar, Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, ChevronDown,
} from "lucide-react";
import AgentAnalysisBanner from "@/components/AgentAnalysisBanner";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_title: string | null;
}

function eventTypeAccent(type: string) {
  const colors: Record<string, string> = {
    notice_sent: "fp-accent-left-blue",
    hearing_held: "fp-accent-left-cyan",
    appeal_filed: "fp-accent-left-purple",
    deadline: "fp-accent-left-red",
    correspondence: "fp-accent-left-gray",
    inspection: "fp-accent-left-amber",
    decision: "fp-accent-left-green",
    fine_imposed: "fp-accent-left-red",
    lien_filed: "fp-accent-left-red",
    abatement: "fp-accent-left-amber",
    evidence_uploaded: "fp-accent-left-blue",
    intelligence_gathered: "fp-accent-left-purple",
    other: "fp-accent-left-gray",
  };
  return colors[type] ?? "fp-accent-left-gray";
}

function eventTypeDotColor(type: string) {
  const colors: Record<string, string> = {
    notice_sent: "bg-fp-blue",
    hearing_held: "bg-fp-cyan",
    appeal_filed: "bg-fp-purple",
    deadline: "bg-fp-red",
    correspondence: "bg-fp-text-dim",
    inspection: "bg-fp-amber",
    decision: "bg-fp-green",
    fine_imposed: "bg-fp-red",
    lien_filed: "bg-fp-red",
    abatement: "bg-fp-amber",
    evidence_uploaded: "bg-fp-blue",
    intelligence_gathered: "bg-fp-purple",
    other: "bg-fp-text-dim",
  };
  return colors[type] ?? "bg-fp-text-dim";
}

const EVENT_TYPES = [
  { value: "notice_sent", label: "Notice Sent" },
  { value: "hearing_held", label: "Hearing Held" },
  { value: "appeal_filed", label: "Appeal Filed" },
  { value: "deadline", label: "Deadline" },
  { value: "correspondence", label: "Correspondence" },
  { value: "inspection", label: "Inspection" },
  { value: "decision", label: "Decision" },
  { value: "fine_imposed", label: "Fine Imposed" },
  { value: "lien_filed", label: "Lien Filed" },
  { value: "abatement", label: "Abatement" },
  { value: "other", label: "Other" },
];

export default function TimelinePanel({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEvent, setNewEvent] = useState({
    event_date: "",
    event_type: "notice_sent",
    description: "",
  });

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

  const handleAdd = async () => {
    if (!newEvent.event_date || !newEvent.event_type) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/timeline?projectId=${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newEvent),
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      setShowAddForm(false);
      setNewEvent({ event_date: "", event_type: "notice_sent", description: "" });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add event");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/v1/timeline?id=${id}&projectId=${projectId}`, { method: "DELETE" });
      fetchData();
    } catch (err) {
      setError("Failed to delete event");
    }
  };

  return (
    <div className="space-y-8 pb-12 max-w-3xl">
      {/* ── Page Header ── */}
      <div className="fp-page-header flex items-start justify-between">
        <div>
          <h2 className="fp-page-title">Timeline</h2>
          <p className="fp-page-subtitle">
            Chronological record of evidence, government actions, and investigation events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            className="p-2.5 rounded-lg fp-card fp-card-lift text-fp-text-muted hover:text-fp-text"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddForm ? "Cancel" : "Add Event"}
          </button>
        </div>
      </div>

      {/* ── Add Event Form ── */}
      {showAddForm && (
        <div className="fp-card p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-fp-text-muted mb-2">Event Date</label>
              <input
                type="date"
                value={newEvent.event_date}
                onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-fp-bg border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-blue/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-fp-text-muted mb-2">Event Type</label>
              <select
                value={newEvent.event_type}
                onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                className="w-full px-3 py-2.5 rounded-lg bg-fp-bg border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-blue/40 appearance-none cursor-pointer"
                style={{
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23889099' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "right 10px center",
                  paddingRight: "30px",
                }}
              >
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-fp-text-muted mb-2">Description (optional)</label>
            <textarea
              value={newEvent.description}
              onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
              placeholder="Describe what happened…"
              rows={2}
              className="w-full px-3 py-2.5 rounded-lg bg-fp-bg border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue/40 resize-none"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!newEvent.event_date || adding}
            className="px-4 py-2.5 rounded-lg bg-fp-cyan text-white text-sm font-medium hover:bg-fp-cyan/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {adding ? "Adding…" : "Add to Timeline"}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-fp-text-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading timeline…
        </div>
      )}

      {/* ── Timeline cards ── */}
      {!loading && items.length > 0 && (
        <div className="relative pl-8">
          {/* Vertical line */}
          <div className="absolute left-[10px] top-2 bottom-2 w-px bg-fp-border" />
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.id} className="relative group">
                {/* Dot */}
                <div className={`absolute -left-[22px] top-5 w-3 h-3 rounded-full ${eventTypeDotColor(item.event_type)} ring-4 ring-fp-bg`} />
                <div className={`fp-card ${eventTypeAccent(item.event_type)} p-5 fp-card-lift`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-fp-text capitalize">
                      {item.event_type.replace(/_/g, " ")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-fp-text-dim">{item.event_date}</span>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="opacity-0 group-hover:opacity-100 text-fp-text-dim hover:text-fp-red transition-all"
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {item.description && (
                    <p className="text-sm text-fp-text-muted mt-2 leading-relaxed">{item.description}</p>
                  )}
                  {item.evidence_title && (
                    <div className="text-[11px] text-fp-text-dim mt-3 flex items-center gap-1.5">
                      <ChevronDown className="w-3 h-3" />
                      Source: {item.evidence_title}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && !error && (
        <div className="fp-card p-16 text-center" style={{ borderStyle: "dashed" }}>
          <Calendar className="w-10 h-10 text-fp-text-dim mx-auto mb-5" />
          <h3 className="text-sm font-medium text-fp-text">No timeline events have been recorded yet.</h3>
          <p className="text-xs text-fp-text-dim mt-1.5 mb-6 max-w-sm mx-auto">
            Add events manually or import evidence — dates from documents will be automatically extracted to build the timeline.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Add First Event
          </button>
        </div>
      )}
    </div>
  );
}
