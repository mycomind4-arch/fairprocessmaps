"use client";

import { useEffect, useState } from "react";
import { ScanLine, Loader2, AlertTriangle, ShieldCheck, AlertCircle, Play } from "lucide-react";

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  created_at: string;
}

interface AgentAnalysisBannerProps {
  projectId: string;
  /** Only show findings matching these rule prefixes (e.g. ["statute_", "discrepancy_"]) */
  filterPrefixes?: string[];
  title?: string;
  description?: string;
}

/**
 * A reusable banner showing agent-produced findings relevant to a specific panel.
 * Pulls from the same due_process_findings table that the analysis agents populate.
 */
export default function AgentAnalysisBanner({
  projectId,
  filterPrefixes = ["statute_", "discrepancy_"],
  title = "Agent Findings",
  description = "Auto-detected by analysis agents",
}: AgentAnalysisBannerProps) {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/findings?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json: { items?: Finding[] } = await res.json();
      const all = json.items ?? [];
      // Filter to only agent-produced findings matching our prefixes
      const filtered = all.filter(f =>
        f.status === "open" &&
        filterPrefixes.some(prefix => f.rule.startsWith(prefix))
      );
      setFindings(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [projectId]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      await fetch(`/api/v1/findings?projectId=${projectId}`, { method: "POST" });
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fp-text-dim text-xs py-2">
        <Loader2 className="w-3 h-3 animate-spin" /> Loading agent findings…
      </div>
    );
  }

  const critical = findings.filter(f => f.severity === "critical");
  const warnings = findings.filter(f => f.severity === "warning");
  const info = findings.filter(f => f.severity === "info");

  return (
    <div className="rounded-xl border border-fp-border bg-fp-surface/30 overflow-hidden">
      <div className="flex items-center justify-between p-3 border-b border-fp-border/50">
        <div className="flex items-center gap-2">
          <ScanLine className="w-3.5 h-3.5 text-fp-cyan" />
          <span className="text-xs font-medium text-fp-text">{title}</span>
          <span className="text-[10px] text-fp-text-dim">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          {findings.length > 0 && (
            <div className="flex items-center gap-1.5">
              {critical.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-fp-red/10 text-fp-red">
                  <AlertTriangle className="w-2.5 h-2.5" /> {critical.length}
                </span>
              )}
              {warnings.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-fp-amber/10 text-fp-amber">
                  <AlertTriangle className="w-2.5 h-2.5" /> {warnings.length}
                </span>
              )}
              {info.length > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-fp-cyan/10 text-fp-cyan">
                  <ShieldCheck className="w-2.5 h-2.5" /> {info.length}
                </span>
              )}
            </div>
          )}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md bg-fp-cyan/10 text-fp-cyan hover:bg-fp-cyan/20 transition-colors disabled:opacity-50"
            title="Run analysis agents"
          >
            {analyzing ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Play className="w-2.5 h-2.5" />}
            {analyzing ? "Running…" : "Run Agents"}
          </button>
        </div>
      </div>
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-fp-red">
          <AlertCircle className="w-3 h-3 shrink-0" /> {error}
        </div>
      )}
      {findings.length > 0 && (
        <div className="px-3 py-2 space-y-1.5 max-h-48 overflow-y-auto">
          {findings.slice(0, 5).map(f => (
            <div key={f.id} className="flex items-start gap-2 text-[11px]">
              {f.severity === "critical" ? (
                <AlertTriangle className="w-3 h-3 text-fp-red shrink-0 mt-0.5" />
              ) : f.severity === "warning" ? (
                <AlertTriangle className="w-3 h-3 text-fp-amber shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-3 h-3 text-fp-cyan shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className="text-fp-text font-medium">{f.rule_name || f.rule}</span>
                <span className="text-fp-text-dim block truncate">{f.detail}</span>
              </div>
            </div>
          ))}
          {findings.length > 5 && (
            <div className="text-[10px] text-fp-text-dim pt-1">
              +{findings.length - 5} more — see Due Process Analysis for all findings
            </div>
          )}
        </div>
      )}
      {findings.length === 0 && !error && (
        <div className="px-3 py-2 text-[11px] text-fp-text-dim">
          No agent findings. Run the analysis agents to detect statute deviations and discrepancies.
        </div>
      )}
    </div>
  );
}
