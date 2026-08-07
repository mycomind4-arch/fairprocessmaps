"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Plus, Map, FileText, Clock, AlertTriangle, ChevronRight, LogOut, Loader2, Network } from "lucide-react";

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
}

export default function Dashboard() {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!loading) {
      fetch("/api/v1/projects/list", { headers: { "Cache-Control": "no-cache" } })
        .then((r) => r.json())
        .then((d: any) => {
          setProjects(d.items ?? []);
          setFetching(false);
        })
        .catch(() => {
          setProjects([]);
          setFetching(false);
        });
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <Loader2 className="w-5 h-5 text-fp-text-dim animate-spin" />
      </div>
    );
  }

  // Summary Stat Calculations
  const totalProjects = projects.length;
  const activeCases = projects.filter((p) => p.status === "open").length;
  const criticalAlerts = projects.reduce((sum, p) => sum + (p.criticalFindingsCount || 0), 0);
  const totalEvidence = projects.reduce((sum, p) => sum + (p.evidenceCount || 0), 0);

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
            <span className="text-xs text-fp-text-dim hidden sm:block">
              {user.email}
            </span>
          )}
          <button
            onClick={() => signOut()}
            className="p-2 rounded-xl text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all"
            title="Sign out"
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

        {/* ── 4 Normalized Summary Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          <div className="glass rounded-[14px] p-6 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Total Projects</span>
            <div className="text-2xl font-semibold text-fp-text mt-2">{totalProjects}</div>
            <span className="text-xs text-fp-text-dim mt-2">Active property matters</span>
          </div>

          <div className="glass rounded-[14px] p-6 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Active Cases</span>
            <div className="text-2xl font-semibold text-fp-blue mt-2">{activeCases}</div>
            <span className="text-xs text-fp-text-dim mt-2">Open investigations</span>
          </div>

          <div className="glass rounded-[14px] p-6 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Critical Alerts</span>
            <div className="text-2xl font-semibold text-fp-red mt-2">{criticalAlerts}</div>
            <span className="text-xs text-fp-text-dim mt-2">Due-process discrepancies</span>
          </div>

          <div className="glass rounded-[14px] p-6 shadow-lg shadow-black/20 flex flex-col justify-between hover:-translate-y-0.5 transition-all duration-200">
            <span className="text-xs uppercase tracking-wide font-medium text-fp-text-dim">Evidence Items</span>
            <div className="text-2xl font-semibold text-fp-text mt-2">{totalEvidence}</div>
            <span className="text-xs text-fp-text-dim mt-2">Public records & filings</span>
          </div>
        </div>

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
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-fp-blue animate-spin" />
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 p-12 glass rounded-[14px] text-center">
              <div className="w-16 h-16 rounded-[14px] glass flex items-center justify-center text-fp-blue shadow-lg">
                <FileText className="w-8 h-8 text-fp-text-dim" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-fp-text">No active projects found</h3>
                <p className="text-sm text-fp-text-muted max-w-md">
                  You have not opened any property investigations yet. Click below to launch the GIS map and locate a parcel.
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

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-fp-border/60 text-xs">
                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Due Process Score</div>
                      <div className="text-sm font-semibold text-fp-text mt-0.5 flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-fp-blue" />
                        {p.due_process_score != null ? p.due_process_score : "N/A"}
                      </div>
                    </div>

                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Critical Findings</div>
                      <div className="text-sm font-semibold mt-0.5 flex items-center gap-1.5">
                        <AlertTriangle className={`w-3.5 h-3.5 ${p.criticalFindingsCount > 0 ? "text-fp-red" : "text-fp-text-dim"}`} />
                        <span className={p.criticalFindingsCount > 0 ? "text-fp-red font-bold" : "text-fp-text"}>
                          {p.criticalFindingsCount}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-fp-text-dim uppercase tracking-wide text-[11px]">Evidence Records</div>
                      <div className="text-sm font-semibold text-fp-text mt-0.5 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-fp-text-dim" />
                        {p.evidenceCount}
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue/15 text-fp-blue hover:bg-fp-blue/25 transition-all text-xs font-semibold"
                      >
                        <Network className="w-3.5 h-3.5" />
                        <span>Fullscreen Graph</span>
                      </button>
                      <button
                        onClick={() => router.push(`/project/${p.id}`)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fp-surface-2 text-fp-text hover:text-white hover:bg-fp-blue/20 transition-all text-xs font-semibold"
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
