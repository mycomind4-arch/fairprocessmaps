"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Calendar, Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, FileText,
  Clock, GitBranch,
} from "lucide-react";
import ProceduralClock from "./ProceduralClock";
import EventReconstruction from "./EventReconstruction";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_title: string | null;
  evidence_id: string | null;
  actor_type: string | null;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  created_at: string;
}

type SubTab = "timeline" | "procedural-clock" | "event-reconstruction";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Calendar }[] = [
  { id: "timeline", label: "Timeline", icon: Calendar },
  { id: "procedural-clock", label: "Procedural Clock", icon: Clock },
  { id: "event-reconstruction", label: "Event Reconstruction", icon: GitBranch },
];

function getEventMeta(type: string) {
  switch (type) {
    case "deadline":
    case "fine_imposed":
    case "lien_filed":
      return {
        borderClass: "border-l-4 border-l-fp-red",
        severityLabel: "Critical",
        badgeClass: "bg-fp-red/15 text-fp-red border-fp-red/30",
      };
    case "inspection":
    case "abatement":
      return {
        borderClass: "border-l-4 border-l-fp-amber",
        severityLabel: "Action Required",
        badgeClass: "bg-fp-amber/15 text-fp-amber border-fp-amber/30",
      };
    case "decision":
      return {
        borderClass: "border-l-4 border-l-fp-green",
        severityLabel: "Formal Outcome",
        badgeClass: "bg-fp-green/15 text-fp-green border-fp-green/30",
      };
    case "notice_sent":
    case "hearing_held":
    case "appeal_filed":
    case "evidence_uploaded":
      return {
        borderClass: "border-l-4 border-l-fp-blue",
        severityLabel: "Procedural",
        badgeClass: "bg-fp-blue/15 text-fp-blue border-fp-blue/30",
      };
    default:
      return {
        borderClass: "border-l-4 border-l-fp-border",
        severityLabel: "Record",
        badgeClass: "bg-fp-surface-2 text-fp-text-dim border-fp-border",
      };
  }
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
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [subTab, setSubTab] = useState<SubTab>("timeline");
  const [newEvent, setNewEvent] = useState({
    event_date: "",
    event_type: "notice_sent",
    description: "",
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [timelineRes, findingsRes] = await Promise.all([
        fetch(`/api/v1/timeline?projectId=${projectId}`, {
          headers: { "Cache-Control": "no-cache" },
        }),
        fetch(`/api/v1/findings?projectId=${projectId}`, {
          headers: { "Cache-Control": "no-cache" },
        }),
      ]);

      if (!timelineRes.ok) throw new Error(`Failed to load timeline: ${timelineRes.status}`);
      const json: { items?: TimelineItem[] } = await timelineRes.json();
      setItems(json.items ?? []);

      // Findings are best-effort — procedural clock and event reconstruction
      // can still work without them
      if (findingsRes.ok) {
        const fJson: { findings?: Finding[] } = await findingsRes.json();
        setFindings(fJson.findings ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); }, [fetchData]);

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
      if (!res.ok) throw new Error(`Failed to create event: ${res.status}`);
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
    <div className="space-y-4 pb-8">
      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 border-b border-fp-border pb-px">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative border-b-2 ${
                active
                  ? "border-fp-blue text-fp-text"
                  : "border-transparent text-fp-text-dim hover:text-fp-text-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {active && (
                <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-fp-blue to-fp-cyan" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Timeline sub-tab ── */}
      {subTab === "timeline" && (
        <div className="space-y-6 animate-[fade-in_0.3s_ease-out]">
          {/* Header */}
          <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Investigation Timeline</h1>
              <p className="text-xs text-fp-text-dim mt-1">Chronological record of official notices, hearings, and enforcement milestones</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchData}
                className="p-2.5 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text hover:bg-fp-surface transition-colors"
                title="Refresh timeline"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-sm"
              >
                {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {showAddForm ? "Cancel" : "Add Event"}
              </button>
            </div>
          </div>

          {/* Add Event Form */}
          {showAddForm && (
            <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
              <h2 className="text-base font-semibold text-fp-text">Add New Timeline Event</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-1.5">Event Date</label>
                  <input
                    type="date"
                    value={newEvent.event_date}
                    onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-blue transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-1.5">Event Type</label>
                  <select
                    value={newEvent.event_type}
                    onChange={(e) => setNewEvent({ ...newEvent, event_type: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-blue transition-colors appearance-none cursor-pointer"
                  >
                    {EVENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-1.5">Description (optional)</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Describe event details, agency actions, or specific demands…"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-blue transition-colors resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-lg bg-fp-surface-2 text-fp-text-muted text-sm font-medium hover:bg-fp-surface transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!newEvent.event_date || adding}
                  className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {adding ? "Saving…" : "Save Event"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div className="glass rounded-[14px] p-4 border-fp-red/30 bg-fp-red/10 flex items-center gap-3 text-fp-red text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading timeline events…
            </div>
          )}

          {/* Timeline Event Cards List */}
          {!loading && items.length > 0 && (
            <div className="space-y-4">
              {items.map((item) => {
                const meta = getEventMeta(item.event_type);
                return (
                  <div
                    key={item.id}
                    className={`glass rounded-[14px] p-6 shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 ${meta.borderClass} group relative`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-mono text-fp-text-dim font-medium uppercase tracking-wider">
                          {item.event_date}
                        </span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium uppercase tracking-wider ${meta.badgeClass}`}>
                          {meta.severityLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-fp-text-dim bg-fp-surface-2 px-2.5 py-1 rounded border border-fp-border/60">
                          Government Source
                        </span>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-fp-text-dim hover:text-fp-red transition-all p-1"
                          title="Delete event"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <h2 className="text-base font-semibold text-fp-text capitalize">
                      {item.event_type.replace(/_/g, " ")}
                    </h2>

                    {item.description && (
                      <p className="text-sm text-fp-text-muted mt-2 leading-relaxed">
                        {item.description}
                      </p>
                    )}

                    {item.evidence_title ? (
                      <div className="mt-4 pt-3 border-t border-fp-border/40 flex items-center gap-2 text-xs text-fp-blue font-medium">
                        <FileText className="w-4 h-4 shrink-0" />
                        <span>Evidence Attached: {item.evidence_title}</span>
                      </div>
                    ) : (
                      <div className="mt-4 pt-3 border-t border-fp-border/30 text-xs text-fp-text-dim">
                        No evidence attached
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Improved Empty State */}
          {!loading && items.length === 0 && !error && (
            <div className="glass rounded-[14px] border-dashed border-fp-border p-8 text-center space-y-3 shadow-lg shadow-black/20">
              <Calendar className="w-8 h-8 text-fp-text-dim mx-auto" />
              <h2 className="text-base font-semibold text-fp-text">No timeline events recorded</h2>
              <p className="text-sm text-fp-text-muted max-w-md mx-auto">
                No events have been logged for this investigation. Add notices, hearings, deadlines, or inspection dates to establish the procedural timeline for due-process analysis.
              </p>
              <div className="pt-2">
                <button
                  onClick={() => setShowAddForm(true)}
                  className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add First Event
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Procedural Clock sub-tab ── */}
      {subTab === "procedural-clock" && (
        <div className="space-y-6 animate-[fade-in_0.3s_ease-out]">
          <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20">
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Procedural Clock</h1>
            <p className="text-xs text-fp-text-dim mt-1">
              Statutory deadline compliance engine — checks elapsed time between procedural steps against statutory requirements.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading procedural data…
            </div>
          ) : items.length === 0 ? (
            <div className="glass rounded-[14px] border-dashed border-fp-border p-8 text-center space-y-3 shadow-lg shadow-black/20">
              <Clock className="w-8 h-8 text-fp-text-dim mx-auto" />
              <h2 className="text-base font-semibold text-fp-text">No timeline events to analyze</h2>
              <p className="text-sm text-fp-text-muted max-w-md mx-auto">
                Add timeline events (notices, hearings, appeals, decisions) to activate the procedural compliance engine.
              </p>
              <button
                onClick={() => setSubTab("timeline")}
                className="mt-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Events
              </button>
            </div>
          ) : (
            <ProceduralClock items={items} findings={findings} />
          )}
        </div>
      )}

      {/* ── Event Reconstruction sub-tab ── */}
      {subTab === "event-reconstruction" && (
        <div className="space-y-6 animate-[fade-in_0.3s_ease-out]">
          <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20">
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">AI Event Reconstruction</h1>
            <p className="text-xs text-fp-text-dim mt-1">
              Infers relationships between events and detects gaps in the procedural sequence — connections verified by evidence are distinguished from inferred ones.
            </p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading event data…
            </div>
          ) : items.length === 0 ? (
            <div className="glass rounded-[14px] border-dashed border-fp-border p-8 text-center space-y-3 shadow-lg shadow-black/20">
              <GitBranch className="w-8 h-8 text-fp-text-dim mx-auto" />
              <h2 className="text-base font-semibold text-fp-text">No events to reconstruct</h2>
              <p className="text-sm text-fp-text-muted max-w-md mx-auto">
                Add timeline events to see inferred connections, procedural sequences, and missing steps.
              </p>
              <button
                onClick={() => setSubTab("timeline")}
                className="mt-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Events
              </button>
            </div>
          ) : (
            <EventReconstruction items={items} findings={findings} />
          )}
        </div>
      )}
    </div>
  );
}
