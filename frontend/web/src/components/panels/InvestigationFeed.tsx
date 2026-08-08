"use client";

import { usePanelData, PanelLoading, PanelError } from "./PanelDataWrapper";

export function InvestigationFeedPanel({ projectId }: { projectId: string }) {
  const { items, findings, loading, error, fetchData } = usePanelData(projectId);
  if (loading) return <PanelLoading label="Loading activity feed…" />;
  if (error) return <PanelError error={error} onRetry={fetchData} />;
  return <InvestigationFeed items={items} findings={findings} />;
}

import { useEffect, useState, useMemo } from "react";
import {
  Activity, Bot, FileText, MapPin, Clock,
  AlertCircle, Search, Zap, RefreshCw,
} from "lucide-react";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_title: string | null;
  created_at: string;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  detail: string | null;
  created_at: string;
}

interface FeedEntry {
  id: string;
  timestamp: string;
  category: "ai_discovery" | "evidence" | "timeline" | "finding" | "system";
  title: string;
  description: string;
  icon: typeof Activity;
  color: string;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return dateStr.slice(0, 10);
}

export default function InvestigationFeed({
  items,
  findings,
}: {
  items: TimelineItem[];
  findings: Finding[];
}) {
  const [refreshing, setRefreshing] = useState(false);

  // Build feed from timeline events, findings, and evidence
  const feed = useMemo<FeedEntry[]>(() => {
    const entries: FeedEntry[] = [];

    // Add timeline events
    for (const item of items.slice(0, 10)) {
      entries.push({
        id: `timeline-${item.id}`,
        timestamp: item.created_at || item.event_date,
        category: "timeline",
        title: `${item.event_type.replace(/_/g, " ")} recorded`,
        description: item.description || item.evidence_title || "Timeline event added to case",
        icon: Clock,
        color: "text-fp-blue",
      });
    }

    // Add findings as AI discoveries
    for (const f of findings.slice(0, 10)) {
      entries.push({
        id: `finding-${f.id}`,
        timestamp: f.created_at,
        category: "ai_discovery",
        title: f.rule_name || f.rule.replace(/_/g, " "),
        description: f.detail || "Due-process finding detected by AI analysis",
        icon: Bot,
        color: f.severity === "critical" ? "text-fp-red" : f.severity === "warning" ? "text-fp-amber" : "text-fp-green",
      });
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    return entries.slice(0, 15);
  }, [items, findings]);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 800);
  };

  const categoryLabel: Record<FeedEntry["category"], string> = {
    ai_discovery: "AI Discovery",
    evidence: "Evidence",
    timeline: "Timeline",
    finding: "Finding",
    system: "System",
  };

  return (
    <div className="glass rounded-xl p-4 border-fp-border shadow-lg shadow-black/20">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Activity className="w-4 h-4 text-fp-blue" />
            {feed.length > 0 && (
              <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-fp-green animate-pulse" />
            )}
          </div>
          <h3 className="text-sm font-semibold text-fp-text">Investigation Feed</h3>
          <span className="text-xs text-fp-text-dim">— live activity</span>
        </div>
        <button
          onClick={handleRefresh}
          className="p-1 rounded text-fp-text-dim hover:text-fp-text transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Feed entries */}
      {feed.length === 0 ? (
        <div className="text-center py-6">
          <Search className="w-8 h-8 text-fp-text-dim mx-auto mb-2" />
          <p className="text-xs text-fp-text-muted">
            No activity yet. Run recon or add evidence to start the investigation.
          </p>
        </div>
      ) : (
        <div className="space-y-1 max-h-[400px] overflow-y-auto">
          {feed.map((entry, idx) => {
            const Icon = entry.icon;
            return (
              <div
                key={entry.id}
                className="flex items-start gap-3 p-2 rounded-lg hover:bg-fp-surface-2/40 transition-colors group"
              >
                {/* Timeline dot */}
                <div className="relative shrink-0 mt-0.5">
                  <div className={`w-7 h-7 rounded-lg bg-fp-surface-2/60 border border-fp-border/60 flex items-center justify-center`}>
                    <Icon className={`w-3.5 h-3.5 ${entry.color}`} />
                  </div>
                  {idx < feed.length - 1 && (
                    <div className="absolute left-1/2 top-7 w-px h-full bg-fp-border/40 -translate-x-1/2" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-fp-text truncate">{entry.title}</span>
                    <span className="text-[10px] text-fp-text-dim shrink-0">{timeAgo(entry.timestamp)}</span>
                  </div>
                  <p className="text-[11px] text-fp-text-muted mt-0.5 line-clamp-2 leading-relaxed">
                    {entry.description}
                  </p>
                  <span className="text-[9px] uppercase tracking-wider text-fp-text-dim font-medium">
                    {categoryLabel[entry.category]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* AI Enhancement Footer */}
      <div className="mt-3 pt-3 border-t border-fp-border/40 flex items-center gap-2 text-xs">
        <Zap className="w-3 h-3 text-fp-blue" />
        <span className="text-fp-text-dim">
          AI continuously monitors for new records, missing documents, and procedural discrepancies.
        </span>
      </div>
    </div>
  );
}
