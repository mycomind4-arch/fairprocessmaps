"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Plus, Map, FileText, Clock, AlertTriangle, ChevronRight, LogOut, Loader2, Network, ClipboardCheck, RefreshCw } from "lucide-react";

interface ProjectListItem {
  id: string;
  name: string;
  case_type: string;
  status: string;
  due_process_score: number | null;
  opened_at: string;
  property: {
    apn: string;
    address: string;
    city: string;
  };
  openFindingsCount: number;
  criticalFindingsCount: number;
  evidenceCount: number;
  timelineCount: number;
}

interface PendingReview {
  id: string;
  agent_name: string;
  proposal_type: string;
  confidence: number;
  created_at: string;
  project_name: string;
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setFetching(true);
    setFetchError(null);
    Promise.all([
      fetch("/api/v1/projects/list", { headers: { "Cache-Control": "no-cache" } }).then(r => r.json() as Promise<{ items?: ProjectListItem[] }>).catch(() => ({ items: [] })),
      fetch("/api/v1/agent-proposals?status=pending", { headers: { "Cache-Control": "no-cache" } }).then(r => r.json() as Promise<{ items?: PendingReview[] }>).catch(() => ({ items: [] })),
    ]).then(([projData, reviewData]) => {
      setProjects(projData.items ?? []);
      setPendingReviews(reviewData.items ?? []);
      setFetching(false);
    }).catch(() => {
      setFetchError("Failed to load dashboard data");
      setProjects([]);
      setPendingReviews([]);
      setFetching(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!loading) {
      loadData();
    }
  }, [user, loading, router, loadData]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-fp-blue animate-spin" />
          <span className="text-sm text-fp-text-dim">Loading workspace…</span>
        </div>
      </div>
    );
  }

  // Summary Stat Calculations
  const totalProjects = projects.length;
  const activeCases = projects.filter((p) => p.status === "open").length;
  const criticalAlerts = projects.reduce((sum, p) => sum + (p.criticalFindingsCount || 0), 0);
  const totalEvidence = projects.reduce((sum, p) => sum + (p.evidenceCount || 0), 0);
  const totalTimelineEvents = projects.reduce((sum, p) => sum + (p.timelineCount || 0), 0);

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      {/* ── Header Bar ── */}
      <header className="h-16 flex items-center justify-between px-8 glass shrink-0 z-20 border-b border-fp-border">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-base tracking-tight text-fp-text leading-none">FairProcess</div>
            <div className="text-xs text-fp-text-dim uppercase tracking-wide mt-1">Evidence-First Workspace</div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {user && (
            <span className="text-sm text-fp-text-dim hidden sm:inline">
              {user.email}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-8 py-8 space-y-8">
        {/* ── Page Title Header ── */}
        <div>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Projects & Investigations</h1>
              <p className="text-sm text-fp-text-muted mt-1">
                Select an active property matter to continue analysis or initiate a new investigation.
              </p>
            </div>
            <button
              onClick={() => router.push("/map")}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-fp-blue text-white text-sm font-medium hover:shadow-lg hover:shadow-fp-blue/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>New Investigation</span>
            </button>
          </div>
          <div className="border-t border-fp-border my-6" />
        </div>

        {/* ── Error State ── */}
        {fetchError && (
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-fp-red/10 border border-fp-red/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-fp-red shrink-0" />
              <span className="text-sm text-fp-text">{fetchError}</span>
            </div>
            <button
              onClick={loadData}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-fp-red/20 text-fp-red hover:bg-fp-red/30 transition-all text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* ── 5 Summary Stat Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-stretch">
          <div className="glass rounded-[14px] p-5 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Total Projects</span>
            <div className="text-2xl font-semibold text-fp-text mt-2">{totalProjects}</div>
            <span className="text-xs text-fp-text-dim mt-1">Active matters</span>
          </div>

          <div className="glass rounded-[14px] p-5 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Active Cases</span>
            <div className="text-2xl font-semibold text-fp-blue mt-2">{activeCases}</div>
            <span className="text-xs text-fp-text-dim mt-1">Open investigations</span>
          </div>

          <div className="glass rounded-[14px] p-5 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Critical Alerts</span>
            <div className="text-2xl font-semibold text-fp-red mt-2">{criticalAlerts}</div>
            <span className="text-xs text-fp-text-dim mt-1">Due-process discrepancies</span>
          </div>

          <div className="glass rounded-[14px] p-5 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Timeline Events</span>
            <div className="text-2xl font-semibold text-fp-text mt-2">{totalTimelineEvents}</div>
            <span className="text-xs text-fp-text-dim mt-1">Across all cases</span>
          </div>

          <div className="glass rounded-[14px] p-5 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Evidence Items</span>
            <div className="text-2xl font-semibold text-fp-text mt-2">{totalEvidence}</div>
            <span className="text-xs text-fp-text-dim mt-1">Records & filings</span>
          </div>
        </div>

        {/* ── Pending Reviews Section ── */}
        {pendingReviews.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-fp-blue" />
              <h2 className="text-base font-semibold text-fp-text">Pending AI Reviews</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-fp-blue/15 text-fp-blue border border-fp-blue/30">
                {pendingReviews.length} awaiting
              </span>
            </div>
            <div className="space-y-2">
              {pendingReviews.slice(0, 5).map((review) => (
                <div
                  key={review.id}
                  className="flex items-center justify-between gap-4 p-3 rounded-xl glass border border-fp-blue/20 hover:border-fp-blue/40 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-fp-blue/15 flex items-center justify-center shrink-0">
                      <Shield className="w-4 h-4 text-fp-blue" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-fp-text truncate">
                        {review.agent_name}: {review.proposal_type}
                      </div>
                      <div className="text-xs text-fp-text-dim">
                        {review.project_name} · {Math.round(review.confidence * 100)}% confidence
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-fp-text-dim shrink-0">
                    {new Date(review.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Interactive Map Prompt Banner ── */}
        <button
          onClick={() => router.push("/map")}
          className="group w-full flex items-center gap-6 p-6 rounded-[14px] glass hover:-translate-y-0.5 shadow-lg shadow-black/20 hover:border-fp-blue/40 transition-all duration-200"
        >
          <div className="w-12 h-12 rounded-xl bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shadow-md text-fp-blue group-hover:scale-105 transition-transform duration-200">
            <Map className="w-6 h-6" />
          </div>
          <div className="flex-1 text-left">
            <h2 className="text-base font-semibold text-fp-text">Interactive Parcel Map Search</h2>
            <p className="text-sm text-fp-text-muted mt-1">
              Search parcels by APN or street address to inspect spatial GIS data and create new project files.
            </p>
          </div>
          <ChevronRight className="w-5 h-5 text-fp-text-dim group-hover:text-fp-blue group-hover:translate-x-1 transition-all" />
        </button>

        {/* ── Existing Projects List Section ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fp-text">Recent Investigations</h2>
            <span className="text-xs text-fp-text-dim uppercase tracking-wide">
              {projects.length} {projects.length === 1 ? "Record" : "Records"}
            </span>
          </div>

          {fetching ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="glass rounded-[14px] p-6 shadow-lg shadow-black/20 animate-pulse">
                  <div className="h-5 w-2/3 bg-fp-surface-2 rounded mb-3" />
                  <div className="h-3 w-1/2 bg-fp-surface-2 rounded mb-6" />
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t border-fp-border/60">
                    {[0, 1, 2].map(j => (
                      <div key={j}>
                        <div className="h-2 w-16 bg-fp-surface-2 rounded mb-2" />
                        <div className="h-4 w-12 bg-fp-surface-2 rounded" />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-4">
                    <div className="h-3 w-24 bg-fp-surface-2 rounded" />
                    <div className="h-7 w-28 bg-fp-surface-2 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-12 glass rounded-[14px] text-center">
              <div className="w-16 h-16 rounded-[14px] glass flex items-center justify-center text-fp-blue shadow-lg">
                <FileText className="w-8 h-8 text-fp-text-dim" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-fp-text">No active projects found</h3>
                <p className="text-sm text-fp-text-muted max-w-md">
                  You haven&apos;t opened any property investigations yet. Search for a parcel on the map to start your first case.
                </p>
              </div>
              <button
                onClick={() => router.push("/map")}
                className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-fp-blue text-white text-sm font-medium hover:shadow-lg transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Locate Property</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((p) => (
                <div
                  key={p.id}
                  className="group glass rounded-[14px] p-6 shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:border-fp-blue/40 transition-all duration-200 flex flex-col justify-between gap-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <h3 className="text-base font-semibold text-fp-text truncate">{p.name}</h3>
                      <p className="text-xs text-fp-text-dim uppercase tracking-wide">
                        {p.property.address || "No address assigned"} · APN {p.property.apn || "N/A"}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wide shrink-0 ${
                        p.status === "open"
                          ? "bg-fp-blue/15 text-fp-blue border border-fp-blue/30"
                          : "bg-fp-surface-2 text-fp-text-dim border border-fp-border"
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-fp-border/60 text-xs">
                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Score</div>
                      <div className="text-sm font-semibold text-fp-text mt-0.5 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-fp-blue" />
                        {p.due_process_score != null ? p.due_process_score : "N/A"}
                      </div>
                    </div>

                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Critical</div>
                      <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 ${p.criticalFindingsCount > 0 ? "text-fp-red" : "text-fp-text-dim"}`} />
                        <span className={p.criticalFindingsCount > 0 ? "text-fp-red font-bold" : "text-fp-text"}>
                          {p.criticalFindingsCount}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Evidence</div>
                      <div className="text-sm font-semibold text-fp-text mt-0.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-fp-text-dim" />
                        {p.evidenceCount}
                      </div>
                    </div>

                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Timeline</div>
                      <div className="text-sm font-semibold text-fp-text mt-0.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-fp-text-dim" />
                        {p.timelineCount || 0}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-fp-text-dim flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Opened {new Date(p.opened_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/investigation/${p.id}`);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-fp-text-dim hover:text-fp-blue hover:bg-fp-blue/10 transition-all text-xs font-medium"
                        title="Open fullscreen graph view"
                        aria-label="Open graph view"
                      >
                        <Network className="w-3.5 h-3.5" />
                        <span>Graph</span>
                      </button>
                      <button
                        onClick={() => router.push(`/project/${p.id}`)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-fp-blue text-white hover:bg-fp-blue/90 transition-all text-xs font-semibold shadow-sm shadow-fp-blue/20"
                      >
                        <span>Open Workspace</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
