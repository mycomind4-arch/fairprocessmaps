"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  CheckCircle2, XCircle, Loader2, AlertCircle,
  Bot, RefreshCw, X, FileText, Database, Search,
} from "lucide-react";

type AgentStatus = "pending" | "running" | "success" | "no_data" | "error";

interface AgentState {
  name: string;
  description: string;
  status: AgentStatus;
  message?: string;
}

interface ReconProgressModalProps {
  projectId: string;
  force?: boolean;
  onComplete?: (result: { succeeded: number; failed: number; noData: number; total: number }) => void;
  onClose?: () => void;
  autoStart?: boolean;
}

// Category labels for grouping
const AGENT_CATEGORIES: Record<string, { label: string; icon: typeof Bot }> = {
  parcel: { label: "County GIS", icon: Database },
  zoning: { label: "County GIS", icon: Database },
  coastal_zone: { label: "Environmental", icon: Search },
  flood: { label: "Environmental", icon: Search },
  fire: { label: "Environmental", icon: Search },
  tsunami: { label: "Environmental", icon: Search },
  seismic: { label: "Environmental", icon: Search },
  sea_level_rise: { label: "Environmental", icon: Search },
  airport: { label: "Environmental", icon: Search },
  jurisdiction: { label: "Jurisdiction", icon: FileText },
  natural_resources: { label: "Environmental", icon: Search },
  adu: { label: "Permits", icon: FileText },
  building_permits: { label: "Records", icon: Database },
  code_enforcement: { label: "Records", icon: Database },
  county_recorder: { label: "Records", icon: Database },
  due_process_analysis: { label: "Analysis", icon: Bot },
};

export default function ReconProgressModal({
  projectId,
  force = false,
  onComplete,
  onClose,
  autoStart = true,
}: ReconProgressModalProps) {
  const [agents, setAgents] = useState<AgentState[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ succeeded: number; failed: number; noData: number; total: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startRecon = useCallback(() => {
    setRunning(true);
    setDone(false);
    setError(null);
    setSummary(null);
    setAgents([]);

    const url = `/api/v1/intelligence/recon/stream?projectId=${encodeURIComponent(projectId)}${force ? "&force=true" : ""}`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setAgents((prev) => {
        // Replace if exists, otherwise add
        const existing = prev.findIndex((a) => a.name === data.agent);
        const newAgent: AgentState = { name: data.agent, description: data.description, status: "running" };
        if (existing >= 0) {
          const copy = [...prev];
          copy[existing] = newAgent;
          return copy;
        }
        return [...prev, newAgent];
      });
    });

    es.addEventListener("agent_done", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setAgents((prev) =>
        prev.map((a) =>
          a.name === data.agent
            ? { ...a, status: data.status, message: data.message }
            : a,
        ),
      );
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      if (data.skipped) {
        setDone(true);
        setRunning(false);
        setSummary({ succeeded: 0, failed: 0, noData: 0, total: 0 });
      } else {
        setSummary({ succeeded: data.succeeded, failed: data.failed, noData: data.noData, total: data.total });
        setDone(true);
        setRunning(false);
        onComplete?.({ succeeded: data.succeeded, failed: data.failed, noData: data.noData, total: data.total });
      }
      es.close();
      eventSourceRef.current = null;
    });

    es.addEventListener("error", (e: MessageEvent) => {
      // Check if it's a data error event or a connection error
      try {
        const data = e.data ? JSON.parse(e.data) : null;
        if (data?.message) {
          setError(data.message);
        }
      } catch {
        // Connection error — EventSource will auto-retry, but if we're done, close
        if (done) {
          es.close();
          eventSourceRef.current = null;
        }
      }
      setRunning(false);
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [projectId, force, onComplete, done]);

  // Auto-start recon
  useEffect(() => {
    if (autoStart) startRecon();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const completedCount = agents.filter((a) => a.status === "success" || a.status === "no_data" || a.status === "error").length;
  const totalCount = agents.length;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const succeededCount = agents.filter((a) => a.status === "success").length;
  const failedCount = agents.filter((a) => a.status === "error").length;
  const noDataCount = agents.filter((a) => a.status === "no_data").length;

  // Group agents by category
  const categoryOrder = ["County GIS", "Environmental", "Jurisdiction", "Permits", "Records", "Analysis"];
  const groupedAgents = categoryOrder.map((cat) => ({
    category: cat,
    items: agents.filter((a) => AGENT_CATEGORIES[a.name]?.label === cat),
  })).filter((g) => g.items.length > 0);

  // Render minimized bar
  if (minimized && (running || done)) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-[slide-up_0.2s_ease-out]">
        <div className="surface-flat rounded-xl shadow-2xl shadow-black/40 p-3 flex items-center gap-3 min-w-[280px]">
          {running ? (
            <Loader2 className="w-4 h-4 text-fp-blue animate-spin shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-fp-green shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-fp-text">
              {running ? "Recon running" : "Recon complete"}
            </div>
            <div className="text-[10px] text-fp-text-dim">
              {completedCount}/{totalCount} agents · {succeededCount} succeeded
            </div>
          </div>
          <button onClick={() => setMinimized(false)} className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors" aria-label="Expand">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/80 backdrop-blur-sm p-4 animate-[fade-in_0.2s_ease-out]" onClick={() => (done || error) && onClose?.()}>
      <div
        className="w-full max-w-2xl rounded-xl surface-flat shadow-2xl shadow-black/50 animate-[scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Property Intelligence Recon"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-fp-border shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${running ? "bg-fp-blue/15" : done ? "bg-fp-green/15" : "bg-fp-surface-2"}`}>
              {running ? <Loader2 className="w-4 h-4 text-fp-blue animate-spin" /> : done ? <CheckCircle2 className="w-4 h-4 text-fp-green" /> : <Bot className="w-4 h-4 text-fp-text-dim" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-fp-text">Property Intelligence Recon</h2>
              <p className="text-xs text-fp-text-dim mt-0.5">
                {running ? "Agents gathering data from county systems…" : done ? `Complete: ${succeededCount} succeeded, ${failedCount} failed, ${noDataCount} no data` : "Ready to start"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {running && (
              <button onClick={() => setMinimized(true)} className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors" title="Minimize" aria-label="Minimize">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {(done || error) && (
              <button onClick={() => onClose?.()} className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors" title="Close" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="px-5 py-3 border-b border-fp-border/50 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Overall Progress</span>
              <span className="text-xs font-mono text-fp-text">{completedCount}/{totalCount}</span>
            </div>
            <div className="h-1.5 rounded-full bg-fp-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-fp-blue transition-all duration-300 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Agent list — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-3 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {groupedAgents.map(({ category, items }) => (
            <div key={category} className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-semibold flex items-center gap-1.5 mb-1">
                {category}
              </div>
              {items.map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-start gap-3 p-2.5 rounded-lg bg-fp-surface-2/40 border border-fp-border/60 transition-colors"
                >
                  {/* Status icon */}
                  <div className="shrink-0 mt-0.5">
                    {agent.status === "pending" && <div className="w-4 h-4 rounded-full border-2 border-fp-border" />}
                    {agent.status === "running" && <Loader2 className="w-4 h-4 text-fp-blue animate-spin" />}
                    {agent.status === "success" && <CheckCircle2 className="w-4 h-4 text-fp-green" />}
                    {agent.status === "no_data" && <div className="w-4 h-4 rounded-full border-2 border-fp-text-dim flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-fp-text-dim" /></div>}
                    {agent.status === "error" && <XCircle className="w-4 h-4 text-fp-red" />}
                  </div>

                  {/* Agent info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fp-text capitalize">{agent.name.replace(/_/g, " ")}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        agent.status === "success" ? "text-fp-green bg-fp-green/10" :
                        agent.status === "error" ? "text-fp-red bg-fp-red/10" :
                        agent.status === "no_data" ? "text-fp-text-dim bg-fp-surface-2" :
                        agent.status === "running" ? "text-fp-blue bg-fp-blue/10" :
                        "text-fp-text-dim"
                      }`}>
                        {agent.status === "pending" ? "queued" : agent.status === "running" ? "running" : agent.status}
                      </span>
                    </div>
                    <div className="text-xs text-fp-text-muted mt-0.5">{agent.description}</div>
                    {agent.message && agent.status !== "running" && (
                      <div className="text-xs text-fp-text-dim mt-1 leading-relaxed line-clamp-2">{agent.message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {totalCount === 0 && !error && (
            <div className="flex items-center justify-center py-8 text-fp-text-dim text-sm">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue mr-2" />
              Initializing agents…
            </div>
          )}
        </div>

        {/* Footer */}
        {done && (
          <div className="px-5 py-3 border-t border-fp-border shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-fp-green"><CheckCircle2 className="w-3.5 h-3.5" /> {succeededCount} succeeded</span>
              <span className="flex items-center gap-1.5 text-fp-red"><XCircle className="w-3.5 h-3.5" /> {failedCount} failed</span>
              <span className="flex items-center gap-1.5 text-fp-text-dim"><div className="w-3 h-3 rounded-full border border-fp-text-dim" /> {noDataCount} no data</span>
            </div>
            <button
              onClick={() => onClose?.()}
              className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
