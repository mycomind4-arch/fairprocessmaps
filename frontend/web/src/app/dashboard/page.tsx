"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Plus, Map, FileText, Clock, AlertTriangle, ChevronRight, LogOut, Loader2, Network, AlertCircle } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      {/* ── Header ── */}
      <header className="h-16 flex items-center justify-between px-6 glass shrink-0 z-20 border-b border-fp-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-base tracking-tight text-fp-text leading-none">FairProcess</div>
            <div className="text-[10px] text-fp-text-dim uppercase tracking-widest mt-0.5">Evidence-First</div>
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
            className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-10">
        {/* ── Page Header ── */}
        <div className="fp-page-header mb-8">
          <h1 className="fp-page-title text-2xl">Projects</h1>
          <p className="fp-page-subtitle">Select a project to continue or create a new one.</p>
        </div>

        {/* ── New Project Card ── */}
        <button
          onClick={() => router.push("/map")}
          className="group w-full mb-6 flex items-center gap-4 p-5 fp-card fp-card-lift text-left"
        >
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20 group-hover:shadow-fp-blue/30 transition-all">
            <Plus className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-fp-text">New Project</div>
            <div className="text-xs text-fp-text-muted mt-0.5">
              Open the parcel map to find a property and start a new case
            </div>
          </div>
          <Map className="w-5 h-5 text-fp-text-dim group-hover:text-fp-cyan transition-colors" />
        </button>

        {/* ── Existing Projects ── */}
        {fetching ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 text-fp-text-dim animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          <div className="fp-card p-12 text-center" style={{ borderStyle: "dashed" }}>
            <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center mx-auto mb-5">
              <FileText className="w-7 h-7 text-fp-text-dim" />
            </div>
            <h3 className="text-sm font-medium text-fp-text">No projects have been created yet.</h3>
            <p className="text-xs text-fp-text-dim mt-1.5 mb-6 max-w-sm mx-auto">
              Open the parcel map to find a property and start your first investigation.
            </p>
            <button
              onClick={() => router.push("/map")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Start New Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projects.map((p) => (
              <div
                key={p.id}
                className="group fp-card fp-card-lift p-5 cursor-pointer"
                onClick={() => router.push(`/project/${p.id}`)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-fp-text truncate">{p.name}</h3>
                    <p className="text-xs text-fp-text-dim mt-1">
                      {p.property.address || "No address"} · APN {p.property.apn}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/investigation/${p.id}`); }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-fp-blue/10 text-fp-blue hover:bg-fp-blue/20 transition-colors text-[11px] font-medium"
                    >
                      <Network className="w-3 h-3" />
                      Investigate
                    </button>
                    <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-cyan transition-colors" />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-fp-text-muted">
                  {p.due_process_score != null && (
                    <span className="flex items-center gap-1">
                      <Shield className="w-3 h-3" />
                      Score: {p.due_process_score}
                    </span>
                  )}
                  {p.criticalFindingsCount > 0 && (
                    <span className="flex items-center gap-1 text-fp-red font-medium">
                      <AlertTriangle className="w-3 h-3" />
                      {p.criticalFindingsCount} critical
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {p.evidenceCount} evidence
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(p.opened_at).toLocaleDateString()}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ml-auto ${
                    p.status === "open"
                      ? "bg-fp-amber/15 text-fp-amber"
                      : "bg-fp-text-dim/10 text-fp-text-dim"
                  }`}>
                    {p.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
