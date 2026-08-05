"use client";

import { useState, useEffect } from "react";
import { ToggleLeft, ToggleRight, Loader2, Package, FlaskConical, Star } from "lucide-react";
import { adminApi } from "@/lib/api/admin";
import type { Feature, OrganizationFeature } from "@/lib/types/identity";

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core Platform",
  recon: "Reconnaissance",
  advanced: "Advanced",
  integrations: "Integrations",
  ai: "AI & Analysis",
};

interface FeatureManagementProps {
  orgId: string;
}

export function FeatureManagement({ orgId }: FeatureManagementProps) {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [orgFeatures, setOrgFeatures] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [orgId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allFeatures, enabled] = await Promise.all([
        adminApi.features.list(),
        adminApi.features.orgFeatures(orgId),
      ]);
      setFeatures(allFeatures);
      const enabledIds = new Set(enabled.map((f: OrganizationFeature) => f.feature_id));
      // Also add default features
      allFeatures.filter((f) => f.is_default).forEach((f) => enabledIds.add(f.id));
      setOrgFeatures(enabledIds);
    } catch {
      setFeatures([]);
      setOrgFeatures(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (featureId: string, enabled: boolean) => {
    setToggling(featureId);
    const newSet = new Set(orgFeatures);
    if (enabled) {
      newSet.delete(featureId);
    } else {
      newSet.add(featureId);
    }
    setOrgFeatures(newSet);

    try {
      await adminApi.features.toggle(orgId, featureId, !enabled);
    } catch {
      // Revert
      setOrgFeatures(new Set(orgFeatures));
    } finally {
      setToggling(null);
    }
  };

  // Group by category
  const categories = [...new Set(features.map((f) => f.category))].sort();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Package className="w-4 h-4 text-fp-cyan" />
        <h3 className="text-sm font-semibold text-fp-text">Feature Registry</h3>
        <span className="text-xs text-fp-text-dim">
          ({orgFeatures.size} enabled of {features.length})
        </span>
      </div>

      {categories.map((cat) => (
        <div key={cat} className="space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-fp-text-dim px-1">
            {CATEGORY_LABELS[cat] || cat}
          </div>
          {features
            .filter((f) => f.category === cat)
            .map((feature) => {
              const isEnabled = orgFeatures.has(feature.id);
              const isToggling = toggling === feature.id;
              return (
                <div
                  key={feature.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-fp-border bg-fp-surface hover:bg-fp-surface-2 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-fp-text">{feature.name}</span>
                      {feature.is_default && (
                        <span className="flex items-center gap-0.5 text-[9px] text-fp-cyan bg-fp-cyan/10 px-1.5 py-0.5 rounded-full">
                          <Star className="w-2 h-2" /> Default
                        </span>
                      )}
                      {feature.is_pilot && (
                        <span className="flex items-center gap-0.5 text-[9px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">
                          <FlaskConical className="w-2 h-2" /> Pilot
                        </span>
                      )}
                    </div>
                    {feature.description && (
                      <div className="text-xs text-fp-text-dim mt-0.5">{feature.description}</div>
                    )}
                    <code className="text-[10px] text-fp-text-dim font-mono">{feature.code}</code>
                  </div>
                  <button
                    onClick={() => handleToggle(feature.id, isEnabled)}
                    disabled={isToggling || feature.is_default}
                    className={`shrink-0 transition-all ${
                      feature.is_default ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    {isToggling ? (
                      <Loader2 className="w-5 h-5 animate-spin text-fp-text-dim" />
                    ) : isEnabled ? (
                      <ToggleRight className="w-8 h-8 text-fp-cyan" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-fp-text-dim" />
                    )}
                  </button>
                </div>
              );
            })}
        </div>
      ))}
    </div>
  );
}
