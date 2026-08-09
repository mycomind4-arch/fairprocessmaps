"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { ArrowRight, AlertTriangle, CheckCircle2, ChevronRight, FileText, Loader2, LogOut, Plus, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { CardSkeleton } from "@/components/ui/states";

interface CaseListItem {
  id: string;
  legacyProjectId: string | null;
  name: string;
  case_type: string;
  status: string;
  due_process_score: number | null;
  opened_at: string;
  property: { apn: string; address: string; city: string };
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
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadData = useCallback(() => {
    setFetching(true);
    setFetchError(null);
    Promise.all([
      fetch("/api/v1/cases", { headers: { "Cache-Control": "no-cache" } }).then(async (r) => {
        if (!r.ok) throw new Error(`Cases unavailable (${r.status})`);
        return r.json() as Promise<{ items?: CaseListItem[] }>;
      }),
      fetch("/api/v1/agent-proposals?status=pending", { headers: { "Cache-Control": "no-cache" } }).then(async (r) => {
        if (!r.ok) return { items: [] };
        return r.json() as Promise<{ items?: PendingReview[] }>;
      }),
    ])
      .then(([caseData, reviewData]) => {
        setCases(caseData.items ?? []);
        setPendingReviews(reviewData.items ?? []);
      })
      .catch((error) => {
        setFetchError(error instanceof Error ? error.message : "Failed to load case data");
        setCases([]);
        setPendingReviews([]);
      })
      .finally(() => setFetching(false));
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!loading) loadData();
  }, [user, loading, router, loadData]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-fp-bg"><div className="space-y-3"><CardSkeleton /><CardSkeleton /></div></div>;
  }

  const totalCases = cases.length;
  const activeCases = cases.filter((item) => item.status === "open").length;
  const criticalAlerts = cases.reduce((sum, item) => sum + (item.criticalFindingsCount || 0), 0);
  const totalEvidence = cases.reduce((sum, item) => sum + (item.evidenceCount || 0), 0);
  const totalTimelineEvents = cases.reduce((sum, item) => sum + (item.timelineCount || 0), 0);

  return (
    <div className="min-h-screen bg-fp-bg text-fp-text">
      <header className="h-16 bg-white border-b border-fp-border flex items-center justify-between px-5 sm:px-8 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-fp-text flex items-center justify-center"><ShieldAlert className="w-4 h-4 text-white" /></div>
          <div>
            <div className="font-semibold text-sm tracking-tight">FairProcessMaps</div>
            <div className="text-[10px] text-fp-text-dim uppercase tracking-[0.12em]">Case workspace</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {user && <span className="hidden sm:block text-xs text-fp-text-muted">{user.email}</span>}
          <button onClick={() => signOut()} className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2" title="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="max-w-[1240px] mx-auto px-5 sm:px-8 py-8 sm:py-10">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 mb-8">
          <div>
            <div className="fp-eyebrow">Your workspace</div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mt-2">Cases</h1>
            <p className="text-sm text-fp-text-muted mt-2 max-w-xl">Build a defensible record from evidence through response and proof.</p>
          </div>
          <button onClick={() => router.push("/map")} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" /> New case <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        {fetchError && <div className="mb-6 flex items-center justify-between gap-4 p-3 rounded-lg bg-red-50 border border-red-100 text-sm"><div className="flex items-center gap-2 text-red-700"><AlertTriangle className="w-4 h-4" />{fetchError}</div><button onClick={loadData} className="text-xs font-semibold text-red-700 flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Retry</button></div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-fp-border border border-fp-border rounded-xl overflow-hidden mb-8">
          {[{ label: "Active cases", value: activeCases }, { label: "Critical findings", value: criticalAlerts }, { label: "Evidence records", value: totalEvidence }, { label: "Timeline events", value: totalTimelineEvents }].map((stat) => (
            <div key={stat.label} className="bg-white px-5 py-4">
              <div className="text-2xl font-semibold tabular-nums">{stat.value}</div>
              <div className="text-xs text-fp-text-dim mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {pendingReviews.length > 0 && <section className="mb-8">
          <div className="flex items-center justify-between mb-3"><div><div className="fp-eyebrow">Needs review</div><h2 className="text-lg font-semibold mt-1">AI proposals</h2></div><span className="text-xs text-fp-text-muted">{pendingReviews.length} awaiting review</span></div>
          <div className="bg-white border border-fp-border rounded-xl divide-y divide-fp-border">
            {pendingReviews.slice(0, 5).map((review) => <div key={review.id} className="flex items-center gap-4 px-4 py-3"><div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><FileText className="w-4 h-4 text-fp-blue" /></div><div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{review.proposal_type}</div><div className="text-xs text-fp-text-dim mt-0.5">{review.agent_name} · {review.project_name}</div></div><span className="text-xs font-medium text-fp-text-muted">{Math.round(review.confidence * 100)}%</span><ChevronRight className="w-4 h-4 text-fp-text-dim" /></div>)}
          </div>
        </section>}

        <section>
          <div className="flex items-end justify-between mb-3"><div><div className="fp-eyebrow">Case files</div><h2 className="text-lg font-semibold mt-1">All cases</h2></div><span className="text-xs text-fp-text-dim">{totalCases} total</span></div>
          {fetching ? <div className="py-12 flex items-center justify-center text-sm text-fp-text-muted"><Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading cases…</div> : cases.length === 0 ? <div className="bg-white border border-dashed border-fp-border rounded-xl py-16 text-center"><Search className="w-7 h-7 text-fp-text-dim mx-auto mb-3" /><p className="text-sm font-medium">No cases yet</p><p className="text-xs text-fp-text-muted mt-1">Start with a property search and create your first case.</p></div> : <div className="bg-white border border-fp-border rounded-xl overflow-hidden divide-y divide-fp-border">
            {cases.map((item) => <button key={item.id} onClick={() => router.push(`/project/${item.legacyProjectId ?? item.id}`)} className="w-full text-left flex items-center gap-4 px-4 sm:px-5 py-4 hover:bg-fp-surface-2 transition-colors group">
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-sm font-semibold truncate group-hover:text-fp-blue">{item.name}</span><span className="hidden sm:inline text-[10px] uppercase tracking-wide text-fp-text-dim">{item.case_type.replace(/_/g, " ")}</span></div><div className="flex items-center gap-3 text-xs text-fp-text-muted mt-1"><span className="font-mono">{item.property.apn}</span><span className="truncate">{item.property.address || "No address"}</span><span className="hidden md:inline">{item.property.city}</span></div></div>
              <div className="hidden sm:flex items-center gap-3 shrink-0">{item.criticalFindingsCount > 0 && <span className="px-2 py-1 rounded-md bg-red-50 text-red-700 border border-red-100 text-[10px] font-semibold">{item.criticalFindingsCount} critical</span>}<span className={`px-2 py-1 rounded-md text-[10px] font-semibold border ${item.status === "open" ? "bg-amber-50 text-amber-800 border-amber-100" : "bg-green-50 text-green-800 border-green-100"}`}>{item.status}</span>{item.due_process_score != null && <span className="text-sm font-semibold tabular-nums">{item.due_process_score}</span>}</div>
              <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-blue shrink-0" />
            </button>)}
          </div>}
        </section>
      </main>
    </div>
  );
}
