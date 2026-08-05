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
    <div className="fp-card fp-card-lift p-6 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${accent ?? "bg-fp-blue/10"}`}>
        <Icon className="w-5 h-5 text-fp-cyan" />
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">{label}</div>
        <div className="text-2xl font-semibold text-fp-text mt-0.5">{value}</div>
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
    <div className="space-y-8 pb-12 max-w-5xl">
      {/* ── Page Header ── */}
      <div className="fp-page-header">
        <h2 className="fp-page-title">{data.projectName}</h2>
        <p className="fp-page-subtitle">
          {caseTypeLabel(data.caseType)} · Opened {data.openedAt?.slice(0, 10)} · APN {data.apn}
        </p>
      </div>

      {/* ── Investigation Summary ── */}
      <div className="fp-card p-6">
        <h3 className="fp-section-title mb-4">Investigation Summary</h3>
        <p className="text-sm text-fp-text-muted leading-relaxed">
          Active investigation into {data.address}. {data.evidenceCount} evidence items, {data.timelineCount} timeline events, and {data.findingsCount} findings recorded.
          {data.criticalCount > 0 && ` ${data.criticalCount} critical findings require immediate attention.`}
        </p>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-4 gap-4">
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

      {/* ── Three columns: Property | Investigation | Risk ── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Property */}
        <div className="fp-card p-6">
          <h3 className="fp-section-title mb-4">Property</h3>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Address</div>
              <div className="text-sm text-fp-text mt-1">{data.address}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">APN</div>
              <div className="text-sm text-fp-text font-mono mt-1">{data.apn}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Case Type</div>
              <div className="text-sm text-fp-text mt-1">{caseTypeLabel(data.caseType)}</div>
            </div>
          </div>
        </div>

        {/* Investigation */}
        <div className="fp-card p-6">
          <h3 className="fp-section-title mb-4">Investigation</h3>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Status</div>
              <div className="text-sm text-fp-text mt-1 capitalize">{data.status}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Opened</div>
              <div className="text-sm text-fp-text mt-1">{data.openedAt?.slice(0, 10)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Evidence Count</div>
              <div className="text-sm text-fp-text mt-1">{data.evidenceCount} documents</div>
            </div>
          </div>
        </div>

        {/* Current Risk */}
        <div className="fp-card p-6">
          <h3 className="fp-section-title mb-4">Current Risk</h3>
          <div className="space-y-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Due Process Score</div>
              <div className="text-sm text-fp-text mt-1">{data.dueProcessScore ?? "—"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Critical Findings</div>
              <div className={`text-sm font-semibold mt-1 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-green"}`}>
                {data.criticalCount > 0 ? `${data.criticalCount} critical` : "None"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">Risk Level</div>
              <div className={`text-sm font-semibold mt-1 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-amber"}`}>
                {data.criticalCount > 0 ? "HIGH" : "MODERATE"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="flex gap-3">
        <button
          onClick={() => onNavigate("intelligence")}
          className="flex items-center gap-2 px-4 py-2.5 fp-card fp-card-lift text-sm text-fp-text-muted hover:text-fp-text transition-colors"
        >
          Property Intelligence <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onNavigate("vault")}
          className="flex items-center gap-2 px-4 py-2.5 fp-card fp-card-lift text-sm text-fp-text-muted hover:text-fp-text transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Upload Evidence
        </button>
        <button
          onClick={() => onNavigate("discrepancies")}
          className="flex items-center gap-2 px-4 py-2.5 fp-card fp-card-lift text-sm text-fp-text-muted hover:text-fp-text transition-colors"
        >
          Due Process Check <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Recent Activity + Recent Evidence (two columns) ── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Recent Timeline */}
        {data.recentTimeline.length > 0 && (
          <div className="fp-card p-6">
            <h3 className="fp-section-title mb-4">Recent Activity</h3>
            <div className="space-y-1">
              {data.recentTimeline.slice(0, 5).map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 py-2.5 border-b border-fp-border-subtle last:border-0">
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

        {/* Recent Evidence */}
        {data.recentEvidence.length > 0 && (
          <div className="fp-card p-6">
            <h3 className="fp-section-title mb-4">Recent Evidence</h3>
            <div className="space-y-1">
              {data.recentEvidence.slice(0, 5).map((ev) => (
                <div key={ev.id} className="flex items-center justify-between py-2.5 border-b border-fp-border-subtle last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm text-fp-text truncate">{ev.title}</div>
                    <div className="text-[11px] text-fp-text-dim mt-0.5">
                      {ev.source} · {ev.created_at?.slice(0, 10)}
                    </div>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded-full shrink-0 ml-3 ${
                    ev.status === "flagged"
                      ? "bg-fp-red/15 text-fp-red"
                      : ev.status === "processed"
                      ? "bg-fp-cyan/10 text-fp-cyan"
                      : "bg-fp-surface-2 text-fp-text-dim"
                  }`}>
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Empty state ── */}
      {data.evidenceCount === 0 && data.timelineCount === 0 && (
        <div className="fp-card p-12 text-center" style={{ borderStyle: "dashed" }}>
          <FileStack className="w-8 h-8 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No evidence has been imported yet.</h3>
          <p className="text-xs text-fp-text-dim mt-1 mb-6 max-w-sm mx-auto">
            Upload documents or connect a county data source to start building your case.
          </p>
          <button
            onClick={() => onNavigate("vault")}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Import Records
          </button>
        </div>
      )}
    </div>
  );
}
