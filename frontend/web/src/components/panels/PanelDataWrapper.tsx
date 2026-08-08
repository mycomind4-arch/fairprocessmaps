"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";

export interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_id: string | null;
  evidence_title: string | null;
  actor_type: string | null;
  created_at: string;
}

export interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  created_at: string;
  missing_info?: number | boolean;
}

export function usePanelData(projectId: string) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tlRes, fRes] = await Promise.all([
        fetch(`/api/v1/timeline?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/findings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
      ]);
      if (tlRes.ok) {
        const tl: any = await tlRes.json();
        setItems(Array.isArray(tl) ? tl : (tl.items || []));
      }
      if (fRes.ok) {
        const f: any = await fRes.json();
        setFindings(Array.isArray(f) ? f : (f.findings || []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [fetchData]);

  return { items, findings, loading, error, fetchData };
}

export function PanelLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-fp-text-muted text-sm">
      <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
      <span>{label}</span>
    </div>
  );
}

export function PanelError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="surface-flat rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3 text-fp-red text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error}</span>
      </div>
      <button onClick={onRetry} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5" /> Retry
      </button>
    </div>
  );
}
