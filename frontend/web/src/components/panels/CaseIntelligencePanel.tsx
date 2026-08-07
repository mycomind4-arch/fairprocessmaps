"use client";

import { useState, useEffect, useCallback } from "react";
import { LayoutDashboard, Search, Activity, Loader2, AlertCircle } from "lucide-react";
import OverviewPanel from "./OverviewPanel";
import PropertyIntelligence from "./PropertyIntelligence";
import InvestigationFeed from "./InvestigationFeed";
import type { ProjectSection } from "@/components/ProjectNav";

type SubTab = "overview" | "details" | "feed";

const SUB_TABS: { id: SubTab; label: string; icon: typeof Search }[] = [
  { id: "overview", label: "Case Overview", icon: LayoutDashboard },
  { id: "details", label: "Property Details", icon: Search },
  { id: "feed", label: "Activity Feed", icon: Activity },
];

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

/**
 * Merges the former "Overview" and "Property Intelligence" sections into
 * a single "Property Intelligence" nav entry with internal sub-tabs.
 * Also includes the Investigation Feed for live activity tracking.
 */
export default function CaseIntelligencePanel({
  projectId,
  propertyId,
  onNavigate,
}: {
  projectId: string;
  propertyId: string;
  onNavigate: (s: ProjectSection) => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [feedItems, setFeedItems] = useState<TimelineItem[]>([]);
  const [feedFindings, setFeedFindings] = useState<Finding[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  // Fetch timeline + findings for the Investigation Feed (only when feed tab is opened)
  const fetchFeedData = useCallback(async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const [timelineRes, findingsRes] = await Promise.all([
        fetch(`/api/v1/timeline?projectId=${projectId}`, {
          headers: { "Cache-Control": "no-cache" },
        }),
        fetch(`/api/v1/findings?projectId=${projectId}`, {
          headers: { "Cache-Control": "no-cache" },
        }),
      ]);

      if (timelineRes.ok) {
        const tJson: { items?: TimelineItem[] } = await timelineRes.json();
        setFeedItems(tJson.items ?? []);
      }

      if (findingsRes.ok) {
        const fJson: { findings?: Finding[] } = await findingsRes.json();
        setFeedFindings(fJson.findings ?? []);
      }
    } catch (err) {
      setFeedError(err instanceof Error ? err.message : "Failed to load activity feed");
    } finally {
      setFeedLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (subTab === "feed" && feedItems.length === 0 && !feedLoading && !feedError) {
      fetchFeedData();
    }
  }, [subTab, feedItems.length, feedLoading, feedError, fetchFeedData]);

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-1 border-b border-fp-border pb-px">
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-all relative border-b-2 ${
                active
                  ? "border-fp-blue text-fp-text"
                  : "border-transparent text-fp-text-dim hover:text-fp-text-muted"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {active && (
                <div className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-fp-blue to-fp-cyan" />
              )}
            </button>
          );
        })}
      </div>

      <div className="animate-[fade-in_0.3s_ease-out]">
        {subTab === "overview" && (
          <OverviewPanel
            projectId={projectId}
            onNavigate={onNavigate}
            onOpenPropertyDetails={() => setSubTab("details")}
          />
        )}
        {subTab === "details" && <PropertyIntelligence propertyId={propertyId} />}
        {subTab === "feed" && (
          feedLoading ? (
            <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading activity feed…
            </div>
          ) : feedError ? (
            <div className="glass rounded-[14px] p-4 border-fp-red/30 bg-fp-red/10 flex items-center gap-3 text-fp-red text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{feedError}</span>
            </div>
          ) : (
            <InvestigationFeed items={feedItems} findings={feedFindings} />
          )
        )}
      </div>
    </div>
  );
}
