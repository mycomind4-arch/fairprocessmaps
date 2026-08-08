"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, Calendar,
  Loader2, AlertCircle, RefreshCw, ArrowRight, Plus, Building2,
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
  projectId, onNavigate, onOpenPropertyDetails,
}: { projectId: string; onNavigate: (s: ProjectSection) => void; onOpenPropertyDetails?: () => void }) {
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
      <div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
        Loading investigation overview…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface-flat rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error ?? "No overview data available"}</span>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-8">
      {/* Top: Investigation Summary Block */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-fp-text-dim mb-1 font-medium">Investigation Summary</div>
            <h1 className="text-xl font-semibold tracking-tight text-fp-text">{data.projectName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("vault")}
              className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all"
            >
              <Plus className="w-4 h-4 inline mr-1.5" />
              Upload Evidence
            </button>
            <button
              onClick={() => onNavigate("legal")}
              className="px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text text-sm font-medium hover:bg-fp-surface hover:border-fp-border-hover transition-colors flex items-center gap-1.5"
            >
              Due Process Check
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Compact Key Facts Bar */}
        <div className="flex items-center gap-4 flex-wrap pt-3 border-t border-fp-border/50">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Case Type</div>
            <div className="text-sm font-semibold text-fp-text mt-0.5">{caseTypeLabel(data.caseType)}</div>
          </div>
          <div className="w-px h-8 bg-fp-border" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Opened</div>
            <div className="text-sm font-semibold text-fp-text mt-0.5">{data.openedAt ? data.openedAt.slice(0, 10) : "—"}</div>
          </div>
          <div className="w-px h-8 bg-fp-border" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Parcel APN</div>
            <div className="text-sm font-mono font-semibold text-fp-text mt-0.5">{data.apn || "—"}</div>
          </div>
          <div className="w-px h-8 bg-fp-border" />
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Status</div>
            <div className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-fp-blue/15 text-fp-blue border border-fp-blue/30 capitalize">
              {data.status || "Active"}
            </div>
          </div>
        </div>
      </div>

      {/* Compact Metrics + Risk Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Left: Compact metrics */}
        <div className="surface-flat rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fp-text flex items-center gap-2">
              <FileStack className="w-4 h-4 text-fp-text-dim" />
              Investigation
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Evidence</div>
              <div className="text-lg font-semibold text-fp-text mt-0.5">{data.evidenceCount}</div>
            </div>
            <div className="w-px h-8 bg-fp-border" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Timeline</div>
              <div className="text-lg font-semibold text-fp-text mt-0.5">{data.timelineCount}</div>
            </div>
            <div className="w-px h-8 bg-fp-border" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Findings</div>
              <div className="text-lg font-semibold text-fp-text mt-0.5">{data.findingsCount}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-fp-border/40">
            <button
              onClick={() => onNavigate("vault")}
              className="text-xs font-medium text-fp-blue hover:underline flex items-center gap-1"
            >
              Evidence Vault <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Right: Risk + Property */}
        <div className="surface-flat rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-fp-text flex items-center gap-2">
              <ShieldAlert className={`w-4 h-4 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-text-dim"}`} />
              Current Risk
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Due Process Score</div>
              <div className={`text-lg font-semibold mt-0.5 ${
                data.dueProcessScore == null ? "text-fp-text-dim" :
                data.dueProcessScore >= 80 ? "text-fp-green" :
                data.dueProcessScore >= 50 ? "text-fp-amber" : "text-fp-red"
              }`}>
                {data.dueProcessScore != null ? data.dueProcessScore : "—"}
              </div>
            </div>
            <div className="w-px h-8 bg-fp-border" />
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Critical Issues</div>
              <div className={`text-lg font-semibold mt-0.5 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-text"}`}>
                {data.criticalCount}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-fp-border/40">
            <button
              onClick={() => (onOpenPropertyDetails ? onOpenPropertyDetails() : onNavigate("intelligence"))}
              className="text-xs font-medium text-fp-blue hover:underline flex items-center gap-1"
            >
              Property Intelligence <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {(data.recentEvidence.length > 0 || data.recentTimeline.length > 0) && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3">Recent Activity</h2>
          <div className="space-y-1.5">
            {data.recentTimeline.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-fp-border/30 last:border-0">
                <Calendar className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
                <span className="font-mono text-fp-text-dim">{event.event_date}</span>
                <span className="text-fp-text-muted truncate">{event.description || event.event_type.replace(/_/g, " ")}</span>
              </div>
            ))}
            {data.recentEvidence.slice(0, 3).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-fp-border/30 last:border-0">
                <FileStack className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
                <span className="text-fp-text-muted truncate">{ev.title}</span>
                <span className="text-fp-text-dim shrink-0">{ev.source.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
