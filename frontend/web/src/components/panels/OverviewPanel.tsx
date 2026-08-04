"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, Calendar, TrendingUp,
  Loader2, AlertCircle, RefreshCw, ArrowRight, Plus,
} from "lucide-react";
import type { ProjectSection } from "@/components/ProjectNav";

interface OverviewData {
  projectName: string;
  caseType: string;
  status: string;
  openedAt: string;
  apn: string;
  address: string;
  evidenceCount: number;
  findingsCount: number;
  criticalCount: number;
  timelineCount: number;
  dueProcessScore: number | null;
  recentEvidence: Array<{
    id: string;
    title: string;
    source: string;
    status: string;
    created_at: string;
  }>;
  recentTimeline: Array<{
    id: string;
    event_date: string;
    event_type: string;
    description: string | null;
  }>;
}

function StatTile({ icon: Icon, label, value, accent }: {
  icon: typeof FileStack; label: string; value: string | number; accent?: string;
}) {
  return (
    <div className="rounded-lg border border-fp-border bg-fp-surface/40 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ?? "bg-fp-blue/10"}`}>
        <Icon className="w-5 h-5 text-fp-cyan" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">{label}</div>
        <div className="text-xl font-semibold text-fp-text">{value}</div>
      </div>
    </div>
  );
}

function caseTypeLabel(ct: string) {
  const labels: Record<string, string> = {
    code_enforcement: "Code Enforcement",
    building: "Building Dept",
    adu_permit: "ADU Permit",
    other: "Other",
  };
  return labels[ct] ?? ct;
}

export default function OverviewPanel({
  projectId, onNavigate,
}: { projectId: string; onNavigate: (s: ProjectSection) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/overview?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Failed to load: ${res.status} ${txt.slice(0, 200)}`);
      }
      const json: OverviewData = await res.json();
      setData(json as OverviewData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fp-text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading overview…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-fp-red text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error ?? "No data"}</span>
        <button onClick={fetchData} className="ml-2 p-1 rounded hover:bg-fp-surface-2">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fp-text">{data.projectName}</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">
            {caseTypeLabel(data.caseType)} · Opened {data.openedAt?.slice(0, 10)} · APN {data.apn}
          </p>
        </div>
        {data.dueProcessScore != null && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-fp-border bg-fp-surface/40">
            <TrendingUp className="w-4 h-4 text-fp-cyan" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim">Due Process Score</div>
              <div className="text-lg font-semibold text-fp-text">{data.dueProcessScore}</div>
            </div>
          </div>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-3">
        <StatTile icon={FileStack} label="Evidence" value={data.evidenceCount} />
        <StatTile
          icon={ShieldAlert}
          label="Findings"
          value={data.findingsCount}
          accent={data.criticalCount > 0 ? "bg-fp-red/10" : "bg-fp-blue/10"}
        />
        <StatTile icon={Calendar} label="Timeline Events" value={data.timelineCount} />
        <StatTile
          icon={TrendingUp}
          label="Critical"
          value={data.criticalCount}
          accent={data.criticalCount > 0 ? "bg-fp-red/10" : "bg-fp-blue/10"}
        />
      </div>

      {/* Quick actions */}
      <div className="flex gap-2">
        <button
          onClick={() => onNavigate("intelligence")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-fp-border bg-fp-surface/40 text-sm text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
        >
          Property Intelligence <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onNavigate("vault")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-fp-border bg-fp-surface/40 text-sm text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Upload Evidence
        </button>
        <button
          onClick={() => onNavigate("discrepancies")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-fp-border bg-fp-surface/40 text-sm text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
        >
          Due Process Check <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Recent timeline */}
      {data.recentTimeline.length > 0 && (
        <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
          <h3 className="text-sm font-medium text-fp-text mb-3">Recent Timeline</h3>
          <div className="space-y-2">
            {data.recentTimeline.slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 py-2 border-b border-fp-border/30 last:border-0">
                <div className="w-2 h-2 rounded-full bg-fp-cyan mt-1.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm text-fp-text">
                    <span className="text-fp-text-dim">{ev.event_date}</span> · {ev.event_type.replace(/_/g, " ")}
                  </div>
                  {ev.description && (
                    <div className="text-xs text-fp-text-muted mt-0.5 line-clamp-2">{ev.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent evidence */}
      {data.recentEvidence.length > 0 && (
        <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
          <h3 className="text-sm font-medium text-fp-text mb-3">Recent Evidence</h3>
          <div className="space-y-2">
            {data.recentEvidence.slice(0, 5).map((ev) => (
              <div key={ev.id} className="flex items-center justify-between py-2 border-b border-fp-border/30 last:border-0">
                <div className="min-w-0">
                  <div className="text-sm text-fp-text truncate">{ev.title}</div>
                  <div className="text-[11px] text-fp-text-dim">
                    {ev.source} · {ev.created_at?.slice(0, 10)}
                  </div>
                </div>
                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ml-3 ${
                  ev.status === "flagged"
                    ? "bg-fp-red/20 text-fp-red"
                    : ev.status === "processed"
                    ? "bg-fp-cyan/15 text-fp-cyan"
                    : "bg-fp-surface-2 text-fp-text-dim"
                }`}>
                  {ev.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.evidenceCount === 0 && data.timelineCount === 0 && (
        <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-8 text-center">
          <FileStack className="w-8 h-8 text-fp-text-dim mx-auto mb-3" />
          <h3 className="text-sm font-medium text-fp-text">No evidence yet</h3>
          <p className="text-xs text-fp-text-dim mt-1 mb-4">
            Upload documents or connect a county data source to start building your case.
          </p>
          <button
            onClick={() => onNavigate("vault")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Upload Evidence
          </button>
        </div>
      )}
    </div>
  );
}
