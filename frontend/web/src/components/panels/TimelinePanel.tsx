"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  Calendar, Loader2, AlertCircle, RefreshCw, Plus, X, Trash2, FileText,
  ChevronDown, ChevronRight, Eye, EyeOff, ZoomIn, ZoomOut,
  ShieldAlert, ShieldCheck, AlertTriangle, Clock, Bot,
  Building2, Mail, Phone, Camera, Gavel, MapPin, User, BookOpen,
  Sparkles, Activity, Filter, GitBranch,
} from "lucide-react";
import ProceduralClock from "./ProceduralClock";
import EventReconstruction from "./EventReconstruction";
import InvestigationFeed from "./InvestigationFeed";

// ── Types ──
interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_id: string | null;
  evidence_title: string | null;
  actor_type: string | null;
  actor_id: string | null;
  actor_organization_id: string | null;
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

interface CaseStats {
  evidence_count: number;
  timeline_event_count: number;
  open_findings_count: number;
  critical_findings_count: number;
  case_name: string;
  status: string;
}

// ── Event Layer Categories ──
const EVENT_LAYERS = [
  { types: ["notice_sent", "correspondence"], label: "Notices & Correspondence", icon: Mail, color: "text-fp-blue" },
  { types: ["inspection", "abatement"], label: "Inspections & Abatement", icon: Building2, color: "text-fp-amber" },
  { types: ["hearing_held", "appeal_filed", "decision"], label: "Hearings & Appeals", icon: Gavel, color: "text-fp-cyan" },
  { types: ["fine_imposed", "lien_filed", "deadline"], label: "Fines, Liens & Deadlines", icon: AlertTriangle, color: "text-fp-red" },
  { types: ["evidence_uploaded", "evidence_withdrawn", "intelligence_gathered"], label: "Evidence & Intelligence", icon: FileText, color: "text-fp-green" },
  { types: ["project_created", "other"], label: "Administrative", icon: Activity, color: "text-fp-text-dim" },
];

const ALL_LAYER_TYPES = new Set(EVENT_LAYERS.flatMap((l) => l.types));

// ── Zoom Levels ──
const ZOOM_LEVELS = [
  { id: "all", label: "All Time", groupFn: (d: string) => d.slice(0, 4) + " — " + getDecade(d) },
  { id: "year", label: "By Year", groupFn: (d: string) => d.slice(0, 4) },
  { id: "month", label: "By Month", groupFn: (d: string) => d.slice(0, 7) },
  { id: "day", label: "By Day", groupFn: (d: string) => d.slice(0, 10) },
];

function getDecade(d: string) {
  const year = parseInt(d.slice(0, 4));
  return `${Math.floor(year / 10) * 10}s`;
}

function formatDateGroup(key: string, zoom: string) {
  if (zoom === "month") {
    const [y, m] = key.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[parseInt(m) - 1] ?? m} ${y}`;
  }
  if (zoom === "day") {
    const [y, m, d] = key.split("-");
    return `${y}-${m}-${d}`;
  }
  return key;
}

// ── Event Severity Meta ──
function getEventMeta(type: string) {
  switch (type) {
    case "deadline":
    case "fine_imposed":
    case "lien_filed":
      return { borderClass: "border-l-fp-red", severityLabel: "Critical", badgeClass: "bg-fp-red/15 text-fp-red border-fp-red/30" };
    case "inspection":
    case "abatement":
      return { borderClass: "border-l-fp-amber", severityLabel: "Action", badgeClass: "bg-fp-amber/15 text-fp-amber border-fp-amber/30" };
    case "decision":
      return { borderClass: "border-l-fp-green", severityLabel: "Outcome", badgeClass: "bg-fp-green/15 text-fp-green border-fp-green/30" };
    case "notice_sent":
    case "hearing_held":
    case "appeal_filed":
    case "evidence_uploaded":
      return { borderClass: "border-l-fp-blue", severityLabel: "Procedural", badgeClass: "bg-fp-blue/15 text-fp-blue border-fp-blue/30" };
    default:
      return { borderClass: "border-l-fp-border", severityLabel: "Record", badgeClass: "bg-fp-surface-2 text-fp-text-dim border-fp-border" };
  }
}

function getLayerForType(type: string) {
  return EVENT_LAYERS.find((l) => l.types.includes(type));
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
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newEvent, setNewEvent] = useState({ event_date: "", event_type: "notice_sent", description: "" });
  const [visibleLayers, setVisibleLayers] = useState<Set<string>>(new Set(EVENT_LAYERS.map((l) => l.label)));
  const [zoomIdx, setZoomIdx] = useState(1); // Default: By Year
  const [selectedEvent, setSelectedEvent] = useState<TimelineItem | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [showFindings, setShowFindings] = useState(true);
  const [showProceduralClock, setShowProceduralClock] = useState(true);
  const [showFeed, setShowFeed] = useState(true);
  const [showReconstruction, setShowReconstruction] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [timelineRes, findingsRes, summaryRes] = await Promise.all([
        fetch(`/api/v1/timeline?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/findings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/cases/${projectId}/summary`, { headers: { "Cache-Control": "no-cache" } }),
      ]);

      if (timelineRes.ok) {
        const json = await timelineRes.json();
        setItems(json.items ?? []);
      }

      if (findingsRes.ok) {
        const json = await findingsRes.json();
        setFindings(json.items ?? []);
      }

      if (summaryRes.ok) {
        const json = await summaryRes.json();
        if (json.ok && json.data) {
          setStats({
            evidence_count: json.data.evidence_count ?? 0,
            timeline_event_count: json.data.timeline_event_count ?? 0,
            open_findings_count: json.data.open_findings_count ?? 0,
            critical_findings_count: json.data.critical_findings_count ?? 0,
            case_name: json.data.case_name ?? "",
            status: json.data.status ?? "",
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load timeline");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  const handleAdd = async () => {
    if (!newEvent.event_date || !newEvent.event_type) return;
    setAdding(true);
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
    } catch {
      setError("Failed to delete event");
    }
  };

  const toggleLayer = (label: string) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  // Filter items by visible layers
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const layer = getLayerForType(item.event_type);
      if (!layer) return visibleLayers.has("Administrative");
      return visibleLayers.has(layer.label);
    });
  }, [items, visibleLayers]);

  // Group items by zoom level
  const groupedItems = useMemo(() => {
    const zoom = ZOOM_LEVELS[zoomIdx];
    const sorted = [...filteredItems].sort((a, b) => b.event_date.localeCompare(a.event_date));
    const groups: Record<string, TimelineItem[]> = {};
    for (const item of sorted) {
      const key = zoom.groupFn(item.event_date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredItems, zoomIdx]);

  // Generate case narrative
  const narrative = useMemo(() => {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => a.event_date.localeCompare(b.event_date));
    const sentences: string[] = [];

    sentences.push(`This case spans ${sorted.length} recorded events from ${sorted[0].event_date} to ${sorted[sorted.length - 1].event_date}.`);

    for (const item of sorted.slice(0, 20)) {
      const typeLabel = item.event_type.replace(/_/g, " ");
      const date = item.event_date;
      const desc = item.description ? item.description : "";
      if (desc) {
        sentences.push(`On ${date}, a ${typeLabel} occurred: ${desc}.`);
      } else {
        sentences.push(`On ${date}, a ${typeLabel} was recorded.`);
      }
    }

    if (sorted.length > 20) {
      sentences.push(`...and ${sorted.length - 20} additional events.`);
    }

    if (findings.length > 0) {
      const critical = findings.filter((f) => f.severity === "critical");
      if (critical.length > 0) {
        sentences.push(`AI analysis has identified ${critical.length} critical due-process concern${critical.length > 1 ? "s" : ""} requiring attention.`);
      }
    }

    return sentences.join(" ");
  }, [items, findings]);

  // Stats for analytics bar
  const analyticsStats = useMemo(() => {
    const eventTypes = new Set(items.map((i) => i.event_type));
    const officials = new Set(items.filter((i) => i.actor_type === "official").map((i) => i.actor_id));
    const hearings = items.filter((i) => i.event_type === "hearing_held").length;
    const documents = items.filter((i) => i.evidence_id).length;
    const aiConfidence = findings.length > 0
      ? Math.round((findings.filter((f) => f.status !== "dismissed").length / findings.length) * 100)
      : null;

    return {
      totalEvents: items.length,
      eventTypes: eventTypes.size,
      officials: officials.size,
      hearings,
      documents,
      potentialViolations: findings.filter((f) => f.severity === "critical" || f.severity === "warning").length,
      aiConfidence,
    };
  }, [items, findings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading timeline…
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-[14px] p-6 border-fp-red/30 bg-fp-red/10 flex items-center gap-3 text-fp-red text-sm">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>{error}</span>
        <button onClick={fetchData} className="ml-auto px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* ═══════════════════════════════════════════════ */}
      {/* ANALYTICS BAR — Case Overview at a Glance        */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="glass rounded-[14px] p-4 border-fp-border shadow-lg shadow-black/20">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-fp-text flex items-center gap-2">
            <Activity className="w-4 h-4 text-fp-blue" />
            Case Overview
          </h2>
          <div className="flex items-center gap-2">
            {stats?.critical_findings_count ? (
              <span className="text-xs px-2.5 py-1 rounded-full bg-fp-red/15 text-fp-red border border-fp-red/30 font-medium">
                {stats.critical_findings_count} Critical
              </span>
            ) : null}
            {analyticsStats.aiConfidence != null && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-fp-blue/10 text-fp-blue border border-fp-blue/20 font-medium">
                AI Confidence {analyticsStats.aiConfidence}%
              </span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
          <StatTile label="Events" value={analyticsStats.totalEvents} icon={Calendar} />
          <StatTile label="Event Types" value={analyticsStats.eventTypes} icon={Filter} />
          <StatTile label="Documents" value={analyticsStats.documents} icon={FileText} />
          <StatTile label="Hearings" value={analyticsStats.hearings} icon={Gavel} />
          <StatTile label="Officials" value={analyticsStats.officials} icon={User} />
          <StatTile label="Potential Issues" value={analyticsStats.potentialViolations} icon={ShieldAlert} color={analyticsStats.potentialViolations > 0 ? "text-fp-red" : "text-fp-text"} />
          <StatTile label="Evidence" value={stats?.evidence_count ?? 0} icon={FileText} />
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* CONTROL BAR — Layers, Zoom, Add, Narrative       */}
      {/* ═══════════════════════════════════════════════ */}
      <div className="glass rounded-[14px] p-4 border-fp-border shadow-lg shadow-black/20 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-fp-text">Investigation Timeline</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNarrative(!showNarrative)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showNarrative ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-muted border border-fp-border hover:text-fp-text"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Narrative
            </button>
            <button
              onClick={() => setShowFindings(!showFindings)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showFindings ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-muted border border-fp-border hover:text-fp-text"
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              AI Findings
            </button>
            <button
              onClick={() => setShowProceduralClock(!showProceduralClock)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showProceduralClock ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-muted border border-fp-border hover:text-fp-text"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Procedural Clock
            </button>
            <button
              onClick={() => setShowFeed(!showFeed)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showFeed ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-muted border border-fp-border hover:text-fp-text"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Feed
            </button>
            <button
              onClick={() => setShowReconstruction(!showReconstruction)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                showReconstruction ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30" : "bg-fp-surface-2 text-fp-text-muted border border-fp-border hover:text-fp-text"
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Reconstruction
            </button>
            <button
              onClick={fetchData}
              className="p-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text-muted hover:text-fp-text transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-all"
            >
              {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {showAddForm ? "Cancel" : "Add Event"}
            </button>
          </div>
        </div>

        {/* Layer Toggles */}
        <div className="flex flex-wrap gap-1.5">
          {EVENT_LAYERS.map((layer) => {
            const Icon = layer.icon;
            const visible = visibleLayers.has(layer.label);
            const count = items.filter((i) => layer.types.includes(i.event_type)).length;
            return (
              <button
                key={layer.label}
                onClick={() => toggleLayer(layer.label)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                  visible
                    ? "bg-fp-surface-2 text-fp-text border-fp-border"
                    : "bg-fp-surface/40 text-fp-text-dim border-fp-border/30 opacity-50"
                }`}
              >
                {visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                <Icon className={`w-3 h-3 ${visible ? layer.color : ""}`} />
                {layer.label}
                {count > 0 && <span className="text-fp-text-dim">({count})</span>}
              </button>
            );
          })}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-fp-text-dim font-medium uppercase tracking-wider">Zoom:</span>
          <div className="flex items-center gap-0.5 bg-fp-surface-2 rounded-lg border border-fp-border p-0.5">
            <button
              onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))}
              disabled={zoomIdx === 0}
              className="p-1 rounded text-fp-text-muted hover:text-fp-text disabled:opacity-30 transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-medium text-fp-text px-2 min-w-[70px] text-center">
              {ZOOM_LEVELS[zoomIdx].label}
            </span>
            <button
              onClick={() => setZoomIdx(Math.min(ZOOM_LEVELS.length - 1, zoomIdx + 1))}
              disabled={zoomIdx === ZOOM_LEVELS.length - 1}
              className="p-1 rounded text-fp-text-muted hover:text-fp-text disabled:opacity-30 transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* CASE NARRATIVE — Auto-generated story             */}
      {/* ═══════════════════════════════════════════════ */}
      {showNarrative && narrative && (
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 animate-[fade-in_0.3s_ease-out]">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-4 h-4 text-fp-blue" />
            <h3 className="text-sm font-semibold text-fp-text">Case Narrative</h3>
            <span className="text-xs text-fp-text-dim">— auto-generated, updates as new evidence arrives</span>
          </div>
          <p className="text-sm text-fp-text-muted leading-relaxed">{narrative}</p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* AI FINDINGS — Inline in the timeline              */}
      {/* ═══════════════════════════════════════════════ */}
      {showFindings && findings.length > 0 && (
        <div className="glass rounded-[14px] p-4 border-fp-border shadow-lg shadow-black/20 space-y-3 animate-[fade-in_0.3s_ease-out]">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-fp-blue" />
            <h3 className="text-sm font-semibold text-fp-text">AI Investigation Findings</h3>
            <span className="text-xs text-fp-text-dim">— {findings.length} detected</span>
          </div>
          {findings.map((f) => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* ═══════════════════════════════════════════════ */}
      {/* PROCEDURAL CLOCK — Statutory deadline tracker     */}
      {/* ═══════════════════════════════════════════════ */}
      {showProceduralClock && (
        <ProceduralClock items={items} findings={findings} />
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* INVESTIGATION FEED — Live activity log            */}
      {/* ═══════════════════════════════════════════════ */}
      {showFeed && (
        <InvestigationFeed items={items} findings={findings} />
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* AI EVENT RECONSTRUCTION — Inferred connections    */}
      {/* ═══════════════════════════════════════════════ */}
      {showReconstruction && (
        <EventReconstruction items={items} findings={findings} />
      )}
      {/* ADD EVENT FORM                                    */}
      {/* ═══════════════════════════════════════════════ */}
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
            <button onClick={() => setShowAddForm(false)} className="px-4 py-2 rounded-lg bg-fp-surface-2 text-fp-text-muted text-sm font-medium hover:bg-fp-surface transition-colors">Cancel</button>
            <button onClick={handleAdd} disabled={!newEvent.event_date || adding} className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 disabled:opacity-50 transition-colors">
              {adding ? "Saving…" : "Save Event"}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* TIMELINE EVENTS — Grouped by zoom level            */}
      {/* ═══════════════════════════════════════════════ */}
      {groupedItems.length === 0 && filteredItems.length === 0 ? (
        <div className="glass rounded-[14px] p-12 text-center">
          <Calendar className="w-12 h-12 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-base font-semibold text-fp-text">No timeline events yet</h3>
          <p className="text-sm text-fp-text-muted mt-1 mb-4">
            Events appear here as evidence is processed and enforcement actions are recorded.
          </p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add First Event
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedItems.map(([groupKey, groupItems]) => (
            <div key={groupKey}>
              {/* Group Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="h-px flex-1 bg-fp-border" />
                <span className="text-xs font-semibold text-fp-text-dim uppercase tracking-wider px-3 py-1 rounded-full bg-fp-surface-2 border border-fp-border">
                  {formatDateGroup(groupKey, ZOOM_LEVELS[zoomIdx].id)}
                </span>
                <span className="text-xs text-fp-text-dim">({groupItems.length})</span>
                <div className="h-px flex-1 bg-fp-border" />
              </div>

              {/* Events in this group */}
              <div className="space-y-3 pl-4 border-l-2 border-fp-border/50 ml-4">
                {groupItems.map((item) => {
                  const meta = getEventMeta(item.event_type);
                  const layer = getLayerForType(item.event_type);
                  const LayerIcon = layer?.icon ?? Activity;
                  const isSelected = selectedEvent?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedEvent(isSelected ? null : item)}
                      className={`glass rounded-[12px] p-4 shadow-lg shadow-black/20 border-l-4 ${meta.borderClass} group relative cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                        isSelected ? "ring-2 ring-fp-blue/40" : ""
                      }`}
                    >
                      {/* Event Header */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-xs font-mono text-fp-text-dim font-medium">{item.event_date}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium uppercase tracking-wider ${meta.badgeClass}`}>
                            {meta.severityLabel}
                          </span>
                          <LayerIcon className={`w-3.5 h-3.5 ${layer?.color ?? "text-fp-text-dim"}`} />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fp-text-dim bg-fp-surface-2 px-2 py-0.5 rounded border border-fp-border/60">
                            {item.actor_type || "system"}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                            className="opacity-0 group-hover:opacity-100 text-fp-text-dim hover:text-fp-red transition-all p-0.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Event Body */}
                      <h3 className="text-sm font-semibold text-fp-text capitalize">
                        {item.event_type.replace(/_/g, " ")}
                      </h3>
                      {item.description && (
                        <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed">{item.description}</p>
                      )}

                      {/* Evidence Link */}
                      {item.evidence_title && (
                        <div className="mt-3 pt-2 border-t border-fp-border/40 flex items-center gap-2 text-xs text-fp-blue font-medium">
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{item.evidence_title}</span>
                        </div>
                      )}

                      {/* Expanded Detail Panel */}
                      {isSelected && (
                        <EventDetailPanel item={item} findings={findings} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat Tile Component ──
function StatTile({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Calendar; color?: string }) {
  return (
    <div className="text-center px-2 py-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
      <Icon className={`w-3.5 h-3.5 mx-auto mb-1 ${color ?? "text-fp-text-dim"}`} />
      <div className={`text-lg font-semibold ${color ?? "text-fp-text"}`}>{value}</div>
      <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">{label}</div>
    </div>
  );
}

// ── Finding Card Component ──
function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);
  const severityColor = finding.severity === "critical" ? "text-fp-red" : finding.severity === "warning" ? "text-fp-amber" : "text-fp-green";
  const SeverityIcon = finding.severity === "critical" ? AlertTriangle : finding.severity === "warning" ? AlertCircle : ShieldCheck;
  const confidence = finding.severity === "critical" ? 96 : finding.severity === "warning" ? 75 : 50;

  return (
    <div className={`p-3 rounded-lg border-l-4 ${finding.severity === "critical" ? "border-l-fp-red bg-fp-red/5" : finding.severity === "warning" ? "border-l-fp-amber bg-fp-amber/5" : "border-l-fp-green bg-fp-green/5"}`}>
      <div
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-3 cursor-pointer"
      >
        <SeverityIcon className={`w-4 h-4 shrink-0 mt-0.5 ${severityColor}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-medium ${severityColor}`}>
              {finding.rule_name || finding.rule.replace(/_/g, " ")}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${severityColor} bg-current/10`}>
              {finding.severity}
            </span>
          </div>
          {finding.detail && (
            <p className="text-xs text-fp-text-muted mt-1 leading-relaxed line-clamp-2">{finding.detail}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Confidence Bar */}
          <div className="flex items-center gap-1">
            <div className="w-16 h-1.5 rounded-full bg-fp-surface-2 overflow-hidden">
              <div className={`h-full rounded-full ${severityColor}`} style={{ width: `${confidence}%` }} />
            </div>
            <span className={`text-xs font-mono ${severityColor}`}>{confidence}%</span>
          </div>
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-fp-text-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-fp-text-dim" />}
        </div>
      </div>

      {expanded && finding.detail && (
        <div className="mt-3 pt-3 border-t border-fp-border/40 space-y-2">
          <p className="text-xs text-fp-text-muted leading-relaxed">{finding.detail}</p>
          <div className="flex items-center gap-3 text-xs text-fp-text-dim">
            <span>Rule: <span className="font-mono">{finding.rule}</span></span>
            <span>Status: <span className="font-medium">{finding.status}</span></span>
            <span>Detected: {finding.created_at.slice(0, 10)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Event Detail Panel (shown when event is clicked) ──
function EventDetailPanel({ item, findings }: { item: TimelineItem; findings: Finding[] }) {
  // Find related findings
  const relatedFindings = findings.filter((f) => f.evidence_id === item.evidence_id);
  const confidence = item.evidence_id ? 100 : 75; // Events with linked evidence are verified

  return (
    <div className="mt-4 pt-4 border-t border-fp-border/40 space-y-4 animate-[fade-in_0.2s_ease-out]">
      {/* Confidence Level */}
      <div className="flex items-center gap-3">
        <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Confidence</span>
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 rounded-full bg-fp-surface-2 overflow-hidden">
            <div
              className={`h-full rounded-full ${confidence >= 90 ? "bg-fp-green" : confidence >= 70 ? "bg-fp-amber" : "bg-fp-red"}`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          <span className={`text-xs font-mono ${confidence >= 90 ? "text-fp-green" : confidence >= 70 ? "text-fp-amber" : "text-fp-red"}`}>
            {confidence}% {confidence >= 90 ? "Verified" : "Probable"}
          </span>
        </div>
      </div>

      {/* Evidence Relationships */}
      <div>
        <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-2">Evidence Relationships</div>
        <div className="grid grid-cols-2 gap-2">
          {item.evidence_title && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
              <FileText className="w-3.5 h-3.5 text-fp-blue" />
              <span className="text-xs text-fp-text truncate">{item.evidence_title}</span>
            </div>
          )}
          {item.actor_type && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
              <User className="w-3.5 h-3.5 text-fp-text-dim" />
              <span className="text-xs text-fp-text capitalize">{item.actor_type}</span>
            </div>
          )}
        </div>
      </div>

      {/* Related AI Findings */}
      {relatedFindings.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-2 flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5" /> AI Findings for this event
          </div>
          <div className="space-y-2">
            {relatedFindings.map((f) => (
              <div key={f.id} className="flex items-start gap-2 p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/40">
                <AlertTriangle className={`w-3 h-3 shrink-0 mt-0.5 ${f.severity === "critical" ? "text-fp-red" : "text-fp-amber"}`} />
                <div>
                  <div className="text-xs font-medium text-fp-text">{f.rule_name || f.rule}</div>
                  {f.detail && <div className="text-xs text-fp-text-dim mt-0.5">{f.detail}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Authority Overlay */}
      <div>
        <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-2">Authority</div>
        <div className="space-y-1.5">
          {item.actor_type && (
            <div className="flex items-center gap-2 text-xs">
              <User className="w-3.5 h-3.5 text-fp-text-dim" />
              <span className="text-fp-text-muted">Performed by: <span className="text-fp-text capitalize">{item.actor_type}</span></span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs">
            <Building2 className="w-3.5 h-3.5 text-fp-text-dim" />
            <span className="text-fp-text-muted">Authority: <span className="text-fp-text">{item.actor_organization_id || "Government Agency"}</span></span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-fp-text-dim" />
            <span className="text-fp-text-muted">Legal basis: <span className="text-fp-blue">Click to look up applicable codes →</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
