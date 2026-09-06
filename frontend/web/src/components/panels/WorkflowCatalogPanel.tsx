"use client";

import { useEffect, useState } from "react";
import { Sparkles, Cog, Lock, ChevronRight, FileSignature, Send } from "lucide-react";
import type { ProjectSection } from "@/components/ProjectNav";

/**
 * The workflow catalog.
 *
 * This is the "self-empowerment" surface: instead of one dense case
 * workspace, a person picks a specific, named thing they're trying to do —
 * respond to a notice, send a records request — and gets walked through it
 * stage by stage, with the same rule everywhere in this app: nothing leaves
 * the organization until a human reads it and says so explicitly.
 *
 * Each workflow declares which of its stages use a model (usesAI) so this
 * list is honest about that up front, rather than a person discovering it
 * mid-flow.
 */

interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  stages: { id: string; name: string; usesAI: boolean; requiresAuthorization: boolean }[];
}

const WORKFLOW_ICONS: Record<string, typeof FileSignature> = {
  "notice-response": FileSignature,
  "public-records-request": Send,
};

export default function WorkflowCatalogPanel({
  projectId,
  onNavigate,
}: {
  projectId: string;
  onNavigate?: (section: ProjectSection) => void;
}) {
  const [catalog, setCatalog] = useState<WorkflowDefinition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/v1/cases/${projectId}/workflows`, { credentials: "include" });
      if (res.ok) {
        const json = (await res.json()) as { catalog?: WorkflowDefinition[] };
        setCatalog(json.catalog ?? []);
      }
      setLoading(false);
    })();
  }, [projectId]);

  if (loading) {
    return <div className="h-48 rounded-[10px] shimmer" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-fp-text">Workflows</h2>
        <p className="text-sm text-fp-text-muted mt-2 max-w-2xl leading-relaxed">
          A specific, named thing you're trying to do — walked through one step at a
          time. Every workflow tells you up front which steps use a model and which
          don't, and none of them send anything outside your organization without you
          reading it first and saying so.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {catalog.map((wf) => {
          const Icon = WORKFLOW_ICONS[wf.id] ?? Cog;
          const aiStages = wf.stages.filter((s) => s.usesAI).length;
          const gatedStages = wf.stages.filter((s) => s.requiresAuthorization).length;

          return (
            <button
              key={wf.id}
              onClick={() => {
                if (wf.id === "notice-response") onNavigate?.("respond" as ProjectSection);
                else if (wf.id === "public-records-request")
                  onNavigate?.("records-request" as ProjectSection);
              }}
              className="text-left fp-panel p-5 hover:border-fp-border-hover hover:shadow-lg hover:shadow-black/5 transition-all group"
            >
              <div className="flex items-start gap-3">
                <span className="w-9 h-9 rounded-lg bg-fp-blue/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-fp-blue" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fp-text">{wf.name}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-fp-text-dim group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-xs text-fp-text-muted mt-1.5 leading-relaxed">
                    {wf.description}
                  </p>
                  <div className="flex items-center gap-3 mt-3 text-[11px] text-fp-text-dim">
                    <span className="flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-fp-purple" /> {aiStages} AI-assisted
                    </span>
                    <span className="flex items-center gap-1">
                      <Cog className="w-3 h-3" /> {wf.stages.length - aiStages} deterministic
                    </span>
                    {gatedStages > 0 && (
                      <span className="flex items-center gap-1 text-fp-amber">
                        <Lock className="w-3 h-3" /> {gatedStages} needs your approval
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
