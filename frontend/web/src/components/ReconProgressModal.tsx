"use client";

import { useEffect, useState } from "react";
import { Loader2, X, Bot, Maximize2, Minimize2 } from "lucide-react";

type AgentStatus = "pending" | "running" | "success" | "no_data" | "error";

interface AgentState {
  name: string;
  description: string;
  status: AgentStatus;
  message?: string;
}

interface ReconState {
  running: boolean;
  agents: AgentState[];
  total: number;
  completed: number;
  succeeded: number;
  failed: number;
  noData: number;
  done: boolean;
  error: string | null;
}

interface TopProgressBarProps {
  projectId: string;
  force?: boolean;
  onComplete?: (result: { succeeded: number; failed: number; noData: number; total: number }) => void;
  autoStart?: boolean;
}

export function useReconStream(projectId: string, force: boolean, onComplete?: (r: any) => void) {
  const [state, setState] = useState<ReconState>({
    running: false,
    agents: [],
    total: 0,
    completed: 0,
    succeeded: 0,
    failed: 0,
    noData: 0,
    done: false,
    error: null,
  });

  const start = () => {
    setState({
      running: true,
      agents: [],
      total: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
      noData: 0,
      done: false,
      error: null,
    });

    const url = `/api/v1/intelligence/recon/stream?projectId=${encodeURIComponent(projectId)}${force ? "&force=true" : ""}`;
    const es = new EventSource(url);

    es.addEventListener("agent_start", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((prev) => {
        const existing = prev.agents.findIndex((a) => a.name === data.agent);
        const newAgent: AgentState = { name: data.agent, description: data.description, status: "running" };
        const agents = existing >= 0
          ? prev.agents.map((a, i) => i === existing ? newAgent : a)
          : [...prev.agents, newAgent];
        return { ...prev, agents, total: data.total || agents.length };
      });
    });

    es.addEventListener("agent_done", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        agents: prev.agents.map((a) =>
          a.name === data.agent
            ? { ...a, status: data.status, message: data.message }
            : a,
        ),
        completed: data.completed,
        succeeded: prev.agents.filter((a) => a.name !== data.agent && a.status === "success").length + (data.status === "success" ? 1 : 0),
        failed: prev.agents.filter((a) => a.name !== data.agent && a.status === "error").length + (data.status === "error" ? 1 : 0),
        noData: prev.agents.filter((a) => a.name !== data.agent && a.status === "no_data").length + (data.status === "no_data" ? 1 : 0),
      }));
    });

    es.addEventListener("complete", (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setState((prev) => ({
        ...prev,
        running: false,
        done: true,
        succeeded: data.succeeded ?? prev.succeeded,
        failed: data.failed ?? prev.failed,
        noData: data.noData ?? prev.noData,
        total: data.total ?? prev.total,
      }));
      onComplete?.({ succeeded: data.succeeded, failed: data.failed, noData: data.noData, total: data.total });
      es.close();
    });

    es.addEventListener("error", (e: MessageEvent) => {
      try {
        const data = e.data ? JSON.parse(e.data) : null;
        if (data?.message) {
          setState((prev) => ({ ...prev, running: false, error: data.message }));
        }
      } catch {
        // Connection error
        setState((prev) => ({ ...prev, running: false }));
      }
      es.close();
    });

    return () => es.close();
  };

  return { state, start };
}

// ── Top Progress Bar — shows at the very top of the page ──
export function TopProgressBar({ state }: { state: ReconState }) {
  const [progress, setProgress] = useState(0);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!state.running && !state.done) return;

    if (state.done) {
      setProgress(100);
      if (state.failed > 0) {
        setLabel(`Recon complete: ${state.succeeded}/${state.total} succeeded, ${state.failed} failed`);
      } else {
        setLabel(`Recon complete: ${state.succeeded}/${state.total} agents succeeded`);
      }
      const t = setTimeout(() => setProgress(0), 4000);
      return () => clearTimeout(t);
    }

    if (state.total > 0) {
      setProgress((state.completed / state.total) * 100);
      const running = state.agents.find((a) => a.status === "running");
      if (running) {
        setLabel(`Running: ${running.name.replace(/_/g, " ")} (${state.completed}/${state.total})`);
      } else {
        setLabel(`Processing agents… (${state.completed}/${state.total})`);
      }
    } else {
      setProgress(5);
      setLabel("Starting recon agents…");
    }
  }, [state]);

  if (progress === 0) return null;

  const isComplete = state.done;
  const isError = state.error && state.failed > 0;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-1.5 pointer-events-none">
      <div
        className={`h-full transition-all duration-500 ease-out ${
          isComplete
            ? isError ? "bg-fp-red" : "bg-fp-green"
            : "bg-fp-blue"
        }`}
        style={{ width: `${progress}%` }}
      />
      {state.running && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-auto">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass shadow-lg text-xs font-medium">
            <Loader2 className="w-3 h-3 animate-spin text-fp-blue" />
            <span className="text-fp-text">{label}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Agent Popup Window — shows all agents running in a draggable/floating panel ──
export function AgentPopup({
  state,
  onClose,
  onMinimize,
  minimized,
}: {
  state: ReconState;
  onClose: () => void;
  onMinimize: () => void;
  minimized: boolean;
}) {
  if (minimized && (state.running || state.done)) {
    return (
      <div className="fixed bottom-4 right-4 z-50 animate-[slide-up_0.2s_ease-out]">
        <button
          onClick={onMinimize}
          className="surface-flat rounded-xl shadow-2xl shadow-black/40 p-3 flex items-center gap-3 sm:min-w-[280px] hover:border-fp-blue/30 border border-transparent transition-colors"
        >
          {state.running ? (
            <Loader2 className="w-4 h-4 text-fp-blue animate-spin shrink-0" />
          ) : (
            <Bot className="w-4 h-4 text-fp-green shrink-0" />
          )}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-xs font-semibold text-fp-text">
              {state.running ? "Recon in progress" : "Recon complete"}
            </div>
            <div className="text-[10px] text-fp-text-dim">
              {state.completed}/{state.total} agents · {state.succeeded} succeeded · {state.failed} failed
            </div>
          </div>
          <Maximize2 className="w-3.5 h-3.5 text-fp-text-dim" />
        </button>
      </div>
    );
  }

  const progressPct = state.total > 0 ? (state.completed / state.total) * 100 : 0;

  // Group agents by category
  const AGENT_CATEGORIES: Record<string, string> = {
    parcel: "County GIS", zoning: "County GIS",
    coastal_zone: "Environmental", flood: "Environmental", fire: "Environmental",
    tsunami: "Environmental", seismic: "Environmental", sea_level_rise: "Environmental",
    airport: "Environmental", natural_resources: "Environmental",
    jurisdiction: "Jurisdiction", adu: "Permits",
    building_permits: "Records", code_enforcement: "Records", county_recorder: "Records",
    due_process_analysis: "Analysis",
  };
  const categoryOrder = ["County GIS", "Environmental", "Jurisdiction", "Permits", "Records", "Analysis"];
  const groupedAgents = categoryOrder.map((cat) => ({
    category: cat,
    items: state.agents.filter((a) => AGENT_CATEGORIES[a.name] === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <div
      className="fixed bottom-3 right-3 left-3 sm:left-auto sm:bottom-4 sm:right-4 z-50 sm:w-[420px] sm:max-w-[calc(100vw-2rem)] max-h-[70vh] animate-[slide-up_0.2s_ease-out]"
      role="dialog"
      aria-label="Agent activity"
    >
      <div className="surface-flat rounded-xl shadow-2xl shadow-black/50 flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-fp-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${state.running ? "bg-fp-blue/15" : state.done ? "bg-fp-green/15" : "bg-fp-surface-2"}`}>
              {state.running ? <Loader2 className="w-3.5 h-3.5 text-fp-blue animate-spin" /> : state.done ? <Bot className="w-3.5 h-3.5 text-fp-green" /> : <Bot className="w-3.5 h-3.5 text-fp-text-dim" />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-fp-text">Agent Activity</h2>
              <p className="text-[10px] text-fp-text-dim mt-0.5">
                {state.running
                  ? `${state.completed}/${state.total} agents complete`
                  : state.done
                  ? `Done: ${state.succeeded} ✓ ${state.failed} ✗ ${state.noData} —`
                  : "Waiting to start…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {state.running && (
              <button onClick={onMinimize} className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors" title="Minimize" aria-label="Minimize">
                <Minimize2 className="w-3.5 h-3.5" />
              </button>
            )}
            {(state.done || state.error) && (
              <button onClick={onClose} className="p-1.5 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors" title="Close" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Progress bar */}
        {state.total > 0 && (
          <div className="px-4 py-2.5 border-b border-fp-border/50 shrink-0">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Progress</span>
              <span className="text-xs font-mono text-fp-text">{state.completed}/{state.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-fp-surface-2 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${state.done ? "bg-fp-green" : "bg-fp-blue"}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Agent list — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {state.error && (
            <div className="flex items-center gap-2 text-fp-red text-sm p-3 rounded-lg bg-fp-red/10 border border-fp-red/20">
              <X className="w-4 h-4 shrink-0" />
              <span>{state.error}</span>
            </div>
          )}

          {groupedAgents.map(({ category, items }) => (
            <div key={category} className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-semibold mb-1">{category}</div>
              {items.map((agent) => (
                <div key={agent.name} className="flex items-start gap-2.5 p-2 rounded-lg bg-fp-surface-2/40 border border-fp-border/60 transition-colors">
                  <div className="shrink-0 mt-0.5">
                    {agent.status === "pending" && <div className="w-3.5 h-3.5 rounded-full border-2 border-fp-border" />}
                    {agent.status === "running" && <Loader2 className="w-3.5 h-3.5 text-fp-blue animate-spin" />}
                    {agent.status === "success" && <div className="w-3.5 h-3.5 rounded-full bg-fp-green flex items-center justify-center text-white text-[8px]">✓</div>}
                    {agent.status === "no_data" && <div className="w-3.5 h-3.5 rounded-full border-2 border-fp-text-dim flex items-center justify-center"><div className="w-1 h-1 rounded-full bg-fp-text-dim" /></div>}
                    {agent.status === "error" && <div className="w-3.5 h-3.5 rounded-full bg-fp-red flex items-center justify-center text-white text-[8px]">✕</div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-fp-text capitalize">{agent.name.replace(/_/g, " ")}</span>
                      <span className={`text-[9px] font-medium px-1 py-0.5 rounded ${
                        agent.status === "success" ? "text-fp-green bg-fp-green/10" :
                        agent.status === "error" ? "text-fp-red bg-fp-red/10" :
                        agent.status === "no_data" ? "text-fp-text-dim bg-fp-surface-2" :
                        agent.status === "running" ? "text-fp-blue bg-fp-blue/10" :
                        "text-fp-text-dim"
                      }`}>
                        {agent.status === "pending" ? "queued" : agent.status}
                      </span>
                    </div>
                    {agent.message && agent.status !== "running" && (
                      <div className="text-[10px] text-fp-text-dim mt-0.5 leading-relaxed line-clamp-2">{agent.message}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}

          {state.agents.length === 0 && !state.error && (
            <div className="flex items-center justify-center py-6 text-fp-text-dim text-xs">
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Starting agents…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
