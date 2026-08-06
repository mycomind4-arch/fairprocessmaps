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
  title = "Agent Intelligence Findings",
  description = "Auto-detected by legal due-process analysis agents",
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
      const filtered = all.filter(
        (f) =>
          f.status === "open" &&
          filterPrefixes.some((prefix) => f.rule.startsWith(prefix))
      );
      setFindings(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    /* eslint-disable-next-line */
  }, [projectId]);

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
      <div className="flex items-center gap-2 text-fp-text-dim text-xs py-3 px-4 glass rounded-[14px]">
        <Loader2 className="w-4 h-4 text-fp-blue animate-spin" />
        <span>Loading automated agent findings…</span>
      </div>
    );
  }

  const critical = findings.filter((f) => f.severity === "critical");
  const warnings = findings.filter((f) => f.severity === "warning");
  const info = findings.filter((f) => f.severity === "info");

  return (
    <div className="rounded-[14px] glass border border-fp-border shadow-lg shadow-black/20 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-fp-border/60">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-fp-blue/15 text-fp-blue border border-fp-blue/30">
            <ScanLine className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-fp-text">{title}</h3>
            <p className="text-xs text-fp-text-dim uppercase tracking-wide">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {findings.length > 0 && (
            <div className="flex items-center gap-2">
              {critical.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-fp-red/20 text-fp-red border border-fp-red/30">
                  <AlertTriangle className="w-3 h-3" /> {critical.length} Critical
                </span>
              )}
              {warnings.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-fp-amber/20 text-fp-amber border border-fp-amber/30">
                  <AlertTriangle className="w-3 h-3" /> {warnings.length} Warnings
                </span>
              )}
              {info.length > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-fp-green/20 text-fp-green border border-fp-green/30">
                  <ShieldCheck className="w-3 h-3" /> {info.length} Verified
                </span>
              )}
            </div>
          )}
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl bg-fp-blue text-white hover:shadow-lg hover:shadow-fp-blue/25 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50"
            title="Run analysis agents"
          >
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{analyzing ? "Running…" : "Run Agents"}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 text-xs text-fp-red bg-fp-red/10 border-b border-fp-red/20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {findings.length > 0 && (
        <div className="p-4 space-y-2 max-h-48 overflow-y-auto">
          {findings.slice(0, 5).map((f) => (
            <div
              key={f.id}
              className="flex items-start gap-3 text-xs p-2.5 rounded-xl bg-fp-surface-2/60 border border-fp-border/50"
            >
              {f.severity === "critical" ? (
                <AlertTriangle className="w-4 h-4 text-fp-red shrink-0 mt-0.5" />
              ) : f.severity === "warning" ? (
                <AlertTriangle className="w-4 h-4 text-fp-amber shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-fp-green shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 space-y-0.5">
                <span className="text-fp-text font-semibold">{f.rule_name || f.rule}</span>
                <span className="text-fp-text-muted block truncate">{f.detail}</span>
              </div>
            </div>
          ))}
          {findings.length > 5 && (
            <div className="text-xs text-fp-text-dim pt-1 font-medium text-center">
              +{findings.length - 5} additional findings — open Due Process Discrepancies panel to inspect all.
            </div>
          )}
        </div>
      )}

      {findings.length === 0 && !error && (
        <div className="p-4 text-xs text-fp-text-muted">
          No active agent findings. Click &quot;Run Agents&quot; to execute automated statutory compliance and discrepancy checks.
        </div>
      )}
    </div>
  );
}
