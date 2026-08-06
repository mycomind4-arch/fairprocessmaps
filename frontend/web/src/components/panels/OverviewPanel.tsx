"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, Calendar, TrendingUp,
  Loader2, AlertCircle, RefreshCw, ArrowRight, Plus, Building2, CheckCircle2
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
      <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
        Loading investigation overview…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error ?? "No overview data available"}</span>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const flaggedEvidence = data.recentEvidence.filter(e => e.status === "flagged" || e.status === "review_required");

  return (
    <div className="space-y-6 pb-8">
      {/* Top: Investigation Summary Block */}
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim mb-1 font-medium">Investigation Summary</div>
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">{data.projectName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate("vault")}
              className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all shadow-sm"
            >
              <Plus className="w-4 h-4 inline mr-1.5" />
              Upload Evidence
            </button>
            <button
              onClick={() => onNavigate("discrepancies")}
              className="px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-fp-text text-sm font-medium hover:bg-fp-surface hover:border-fp-border-hover transition-colors flex items-center gap-2"
            >
              Due Process Check
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Key Facts Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-fp-border/50">
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim">Case Type</div>
            <div className="text-sm font-semibold text-fp-text mt-1">{caseTypeLabel(data.caseType)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim">Opened Date</div>
            <div className="text-sm font-semibold text-fp-text mt-1">{data.openedAt ? data.openedAt.slice(0, 10) : "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim">Parcel APN</div>
            <div className="text-sm font-mono font-semibold text-fp-text mt-1">{data.apn || "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim">Status</div>
            <div className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-fp-blue/15 text-fp-blue border border-fp-blue/30 capitalize">
              {data.status || "Active"}
            </div>
          </div>
        </div>
      </div>

      {/* Middle: 3 Equal-Height Columns Side-by-Side */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
        {/* Column 1: Property */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-fp-text">Property</h2>
              <Building2 className="w-4 h-4 text-fp-text-dim" />
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Address</div>
                <div className="text-sm text-fp-text mt-0.5 font-medium">{data.address || "No address recorded"}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Parcel APN</div>
                <div className="text-sm font-mono text-fp-text-muted mt-0.5">{data.apn || "—"}</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate("intelligence")}
            className="mt-6 text-sm font-medium text-fp-blue hover:underline flex items-center gap-1.5 pt-4 border-t border-fp-border/40"
          >
            Property Intelligence
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Column 2: Investigation */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-fp-text">Investigation</h2>
              <FileStack className="w-4 h-4 text-fp-text-dim" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Evidence Files</div>
                <div className="text-2xl font-semibold text-fp-text mt-1">{data.evidenceCount}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Timeline Events</div>
                <div className="text-2xl font-semibold text-fp-text mt-1">{data.timelineCount}</div>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate("vault")}
            className="mt-6 text-sm font-medium text-fp-blue hover:underline flex items-center gap-1.5 pt-4 border-t border-fp-border/40"
          >
            Evidence Vault
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Column 3: Current Risk */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-fp-text">Current Risk</h2>
              <ShieldAlert className={`w-4 h-4 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-text-dim"}`} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Due Process Score</div>
                <div className="text-2xl font-semibold text-fp-text mt-1">
                  {data.dueProcessScore != null ? data.dueProcessScore : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-fp-text-dim">Critical Issues</div>
                <div className={`text-2xl font-semibold mt-1 ${data.criticalCount > 0 ? "text-fp-red" : "text-fp-text"}`}>
                  {data.criticalCount}
                </div>
              </div>
            </div>
          </div>
          <button
            onClick={() => onNavigate("discrepancies")}
            className="mt-6 text-sm font-medium text-fp-blue hover:underline flex items-center gap-1.5 pt-4 border-t border-fp-border/40"
          >
            Review Discrepancies
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom: Recent Activity, Recent Evidence, Pending Reviews */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fp-text">Recent Activity</h2>
            <button
              onClick={() => onNavigate("timeline")}
              className="text-xs text-fp-blue hover:underline font-medium"
            >
              View all
            </button>
          </div>
          {data.recentTimeline.length > 0 ? (
            <div className="space-y-3">
              {data.recentTimeline.slice(0, 4).map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border/40 space-y-1">
                  <div className="flex items-center justify-between text-xs text-fp-text-dim">
                    <span className="uppercase tracking-wider font-medium text-fp-text-dim">{ev.event_type.replace(/_/g, " ")}</span>
                    <span>{ev.event_date}</span>
                  </div>
                  {ev.description && (
                    <div className="text-sm text-fp-text-muted line-clamp-2">{ev.description}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fp-text-dim italic">No recent activity logged.</p>
          )}
        </div>

        {/* Recent Evidence */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fp-text">Recent Evidence</h2>
            <button
              onClick={() => onNavigate("vault")}
              className="text-xs text-fp-blue hover:underline font-medium"
            >
              View vault
            </button>
          </div>
          {data.recentEvidence.length > 0 ? (
            <div className="space-y-3">
              {data.recentEvidence.slice(0, 4).map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg bg-fp-surface-2/60 border border-fp-border/40 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm text-fp-text font-medium truncate">{ev.title}</div>
                    <div className="text-xs text-fp-text-dim mt-0.5">
                      {ev.source} · {ev.created_at?.slice(0, 10)}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium shrink-0 ${
                    ev.status === "flagged"
                      ? "bg-fp-red/20 text-fp-red"
                      : ev.status === "processed"
                      ? "bg-fp-green/15 text-fp-green"
                      : "bg-fp-surface text-fp-text-dim"
                  }`}>
                    {ev.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fp-text-dim italic">No recent evidence uploaded.</p>
          )}
        </div>

        {/* Pending Reviews */}
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fp-text">Pending Reviews</h2>
            <ShieldAlert className="w-4 h-4 text-fp-amber" />
          </div>
          {data.criticalCount > 0 || flaggedEvidence.length > 0 ? (
            <div className="space-y-3">
              {data.criticalCount > 0 && (
                <div className="p-3 rounded-lg bg-fp-red/10 border border-fp-red/30 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-fp-red font-medium">Critical Discrepancies</div>
                  <div className="text-sm text-fp-text">
                    {data.criticalCount} critical due-process flag{data.criticalCount !== 1 ? "s" : ""} require review.
                  </div>
                  <button
                    onClick={() => onNavigate("discrepancies")}
                    className="text-xs text-fp-red font-medium hover:underline mt-1 inline-block"
                  >
                    Open Due Process Check →
                  </button>
                </div>
              )}
              {flaggedEvidence.map((ev) => (
                <div key={ev.id} className="p-3 rounded-lg bg-fp-amber/10 border border-fp-amber/30 space-y-1">
                  <div className="text-xs uppercase tracking-wider text-fp-amber font-medium">Flagged Document</div>
                  <div className="text-sm text-fp-text font-medium truncate">{ev.title}</div>
                  <div className="text-xs text-fp-text-muted">Source: {ev.source}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-fp-green/10 border border-fp-green/20 text-center space-y-1">
              <CheckCircle2 className="w-5 h-5 text-fp-green mx-auto mb-1" />
              <div className="text-sm font-medium text-fp-text">No pending reviews</div>
              <p className="text-xs text-fp-text-muted">All evidence and due process checks are up to date.</p>
            </div>
          )}
        </div>
      </div>

      {/* Global Empty State */}
      {data.evidenceCount === 0 && data.timelineCount === 0 && (
        <div className="glass rounded-[14px] border-dashed border-fp-border p-8 text-center space-y-3 shadow-lg shadow-black/20">
          <FileStack className="w-8 h-8 text-fp-text-dim mx-auto" />
          <h2 className="text-base font-semibold text-fp-text">No case evidence or timeline events recorded</h2>
          <p className="text-sm text-fp-text-muted max-w-md mx-auto">
            Get started by uploading official correspondence, notices, or permits to populate the evidence vault and automatically generate your investigation timeline.
          </p>
          <div className="pt-2">
            <button
              onClick={() => onNavigate("vault")}
              className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Upload First Evidence
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
