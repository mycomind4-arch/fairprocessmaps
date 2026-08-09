"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Shield, Plus, Map, AlertTriangle, ChevronRight, LogOut, Loader2, ClipboardCheck, RefreshCw } from "lucide-react";
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
      fetch("/api/v1/cases", { headers: { "Cache-Control": "no-cache" } }).then(r => r.json() as Promise<{ items?: CaseListItem[] }>).catch(() => ({ items: [] })),
      fetch("/api/v1/agent-proposals?status=pending", { headers: { "Cache-Control": "no-cache" } }).then(r => r.json() as Promise<{ items?: PendingReview[] }>).catch(() => ({ items: [] })),
    ]).then(([caseData, reviewData]) => {
      setCases(caseData.items ?? []);
      setPendingReviews(reviewData.items ?? []);
      setFetching(false);
    }).catch(() => {
      setFetchError("Failed to load case data");
      setCases([]);
      setPendingReviews([]);
      setFetching(false);
    });
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
      return;
    }
    if (!loading) loadData();
  }, [user, loading, router, loadData]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-fp-bg">
        <div className="flex flex-col items-center gap-3"><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>
      </div>
    );
  }

  const totalCases = cases.length;
  const activeCases = cases.filter((p) => p.status === "open").length;
  const criticalAlerts = cases.reduce((sum, p) => sum + (p.criticalFindingsCount || 0), 0);
  const totalEvidence = cases.reduce((sum, p) => sum + (p.evidenceCount || 0), 0);
  const totalTimelineEvents = cases.reduce((sum, p) => sum + (p.timelineCount || 0), 0);

  return (
    <div className="min-h-screen bg-fp-bg flex flex-col">
      <header className="h-14 flex items-center justify-between px-4 sm:px-6 glass shrink-0 z-20 border-b border-fp-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fp-blue to-fp-cyan flex items-center justify-center shadow-lg shadow-fp-blue/20"><Shield className="w-4 h-4 text-white" /></div>
          <div><div className="font-semibold text-sm tracking-tight text-fp-text leading-none">FairProcessMaps</div><div className="text-[10px] text-fp-text-dim uppercase tracking-wide mt-0.5">Evidence-First Case Workspace</div></div>
        </div>
        <div className="flex items-center gap-4">
          {user && <span className="text-sm text-fp-text-dim hidden sm:inline">{user.email}</span>}
          <button onClick={() => signOut()} className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-all" title="Sign out" aria-label="Sign out"><LogOut className="w-4 h-4" /></button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6" role="main">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div><h1 className="text-xl font-semibold tracking-tight text-fp-text">Cases</h1><p className="text-sm text-fp-text-muted mt-0.5">Select an active property matter to continue analysis or initiate a new investigation.</p></div>
          <button onClick={() => router.push("/map")} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"><Plus className="w-4 h-4" /><span>New Investigation</span></button>
        </div>

        {fetchError && <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-fp-red/10 border border-fp-red/30"><div className="flex items-center gap-3"><AlertTriangle className="w-4 h-4 text-fp-red shrink-0" /><span className="text-sm text-fp-text">{fetchError}</span></div><button onClick={loadData} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-fp-red/20 text-fp-red hover:bg-fp-red/30 transition-all text-xs font-medium"><RefreshCw className="w-3.5 h-3.5" /><span>Retry</span></button></div>}

        <div className="flex items-center gap-3 sm:gap-4 overflow-x-auto surface-flat rounded-lg px-3 sm:px-4 py-2.5 scrollbar-thin">
          <div className="flex items-baseline gap-1.5"><span className="text-lg font-semibold text-fp-text tabular-nums">{totalCases}</span><span className="text-xs text-fp-text-dim uppercase tracking-wide">Cases</span></div>
          <div className="w-px h-6 bg-fp-border hidden sm:block" /><div className="flex items-baseline gap-1.5"><span className="text-lg font-semibold text-fp-blue tabular-nums">{activeCases}</span><span className="text-xs text-fp-text-dim uppercase tracking-wide">Active</span></div>
          <div className="w-px h-6 bg-fp-border hidden sm:block" /><div className="flex items-baseline gap-1.5"><span className={`text-lg font-semibold tabular-nums ${criticalAlerts > 0 ? "text-fp-red" : "text-fp-text"}`}>{criticalAlerts}</span><span className="text-xs text-fp-text-dim uppercase tracking-wide">Critical</span></div>
          <div className="w-px h-6 bg-fp-border hidden sm:block" /><div className="flex items-baseline gap-1.5"><span className="text-lg font-semibold text-fp-text tabular-nums">{totalEvidence}</span><span className="text-xs text-fp-text-dim uppercase tracking-wide">Evidence</span></div>
          <div className="w-px h-6 bg-fp-border hidden sm:block" /><div className="flex items-baseline gap-1.5"><span className="text-lg font-semibold text-fp-text tabular-nums">{totalTimelineEvents}</span><span className="text-xs text-fp-text-dim uppercase tracking-wide">Timeline</span></div>
        </div>

        {pendingReviews.length > 0 && <div className="space-y-2"><div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-fp-blue" /><h2 className="text-sm font-semibold text-fp-text">Pending AI Reviews</h2><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-fp-blue/15 text-fp-blue border border-fp-blue/30">{pendingReviews.length} awaiting</span></div><div className="space-y-1.5">{pendingReviews.slice(0, 5).map((review) => <div key={review.id} className="flex items-center justify-between gap-4 p-2.5 rounded-lg surface-flat border-fp-blue/20 hover:border-fp-blue/40 transition-all"><div className="flex items-center gap-3 min-w-0"><div className="w-7 h-7 rounded-lg bg-fp-blue/15 flex items-center justify-center shrink-0"><Shield className="w-3.5 h-3.5 text-fp-blue" /></div><div className="min-w-0"><div className="text-sm font-medium text-fp-text truncate">{review.agent_name}: {review.proposal_type}</div><div className="text-xs text-fp-text-dim">{review.project_name}</div></div></div><div className="flex items-center gap-2 shrink-0"><span className="text-xs text-fp-text-dim tabular-nums">{(review.confidence * 100).toFixed(0)}%</span><ChevronRight className="w-4 h-4 text-fp-text-dim" /></div></div>)}</div></div>}

        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-fp-text">All Cases</h2>
          {fetching ? <div className="flex items-center justify-center gap-2 py-8 text-fp-text-muted text-sm"><Loader2 className="w-4 h-4 animate-spin text-fp-blue" /><span>Loading cases…</span></div> : cases.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center"><div className="w-12 h-12 rounded-xl surface-flat flex items-center justify-center mb-3"><Map className="w-6 h-6 text-fp-text-dim" /></div><p className="text-sm text-fp-text-muted">No cases yet</p><p className="text-xs text-fp-text-dim mt-1">Start a new investigation from the map page.</p></div> : cases.map((p) => <button key={p.id} onClick={() => router.push(`/project/${p.legacyProjectId ?? p.id}`)} className="w-full flex items-center gap-4 p-3 rounded-lg surface-flat hover:border-fp-blue/40 text-left transition-all group"><div className="flex-1 min-w-0"><div className="flex items-center gap-2"><span className="text-sm font-medium text-fp-text group-hover:text-fp-blue transition-colors truncate">{p.name}</span><span className="text-xs text-fp-text-dim capitalize">{p.case_type.replace(/_/g, " ")}</span></div><div className="flex items-center gap-3 text-xs text-fp-text-dim mt-1"><span className="font-mono">{p.property.apn}</span><span className="truncate">{p.property.address || "No address"}</span></div></div><div className="flex items-center gap-3 shrink-0">{p.criticalFindingsCount > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-fp-red/15 text-fp-red border border-fp-red/30">{p.criticalFindingsCount} critical</span>}<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "open" ? "bg-fp-amber/15 text-fp-amber border border-fp-amber/30" : "bg-fp-green/15 text-fp-green border border-fp-green/30"}`}>{p.status}</span>{p.due_process_score != null && <span className={`text-sm font-semibold tabular-nums ${p.due_process_score >= 80 ? "text-fp-green" : p.due_process_score >= 50 ? "text-fp-amber" : "text-fp-red"}`}>{p.due_process_score}</span>}<ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-text transition-colors" /></div></button>)}
        </div>
      </main>
    </div>
  );
}
