"use client";

import { useEffect, useState } from "react";
import { X, FolderOpen, Plus } from "lucide-react";
import type { CaseType, Project } from "@/lib/types";

interface NewProjectModalProps {
  propertyId: string;
  propertyLabel: string;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
}

const CASE_TYPES: { value: CaseType; label: string }[] = [
  { value: "code_enforcement", label: "Code Enforcement" },
  { value: "building", label: "Building Dept" },
  { value: "adu_permit", label: "ADU Permit" },
  { value: "other", label: "Other" },
];

export default function NewProjectModal({
  propertyId,
  propertyLabel,
  onClose,
  onOpenProject,
}: NewProjectModalProps) {
  const [existing, setExisting] = useState<Project[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [caseType, setCaseType] = useState<CaseType>("code_enforcement");

  useEffect(() => {
    fetch(`/api/v1/property-projects?propertyId=${propertyId}`, {
      headers: { "Cache-Control": "no-cache" },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setExisting(data as Project[]))
      .catch(() => setExisting([]))
      .finally(() => setLoading(false));
  }, [propertyId]);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/property-projects?propertyId=${propertyId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        body: JSON.stringify({ name, case_type: caseType }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Server returned ${res.status}: ${txt.slice(0, 200)}`);
      }
      const project = (await res.json()) as Project;
      if (!project?.id) throw new Error("Server did not return a project id");
      onOpenProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/80 backdrop-blur-md p-4 animate-[fade-in_0.2s_ease-out]">
      <div className="w-full max-w-md rounded-[14px] glass p-6 shadow-2xl shadow-black/50 animate-[scale-in_0.2s_cubic-bezier(0.16,1,0.3,1)] space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-fp-text">Initiate Property Investigation</h2>
            <p className="text-xs text-fp-text-dim uppercase tracking-wide mt-1">{propertyLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && (
          <div className="text-xs text-fp-text-muted py-6 text-center">
            Checking existing project files…
          </div>
        )}

        {!loading && existing && existing.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Existing Projects</div>
            <div className="flex flex-col gap-2">
              {existing.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-fp-surface-2 hover:bg-fp-surface-2/80 text-left text-sm text-fp-text border border-fp-border transition-all"
                >
                  <FolderOpen className="w-4 h-4 text-fp-blue shrink-0" />
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-fp-blue/15 text-fp-blue font-semibold uppercase tracking-wide">
                    {p.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-wide text-fp-text-dim font-medium">Create New Matter</div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-fp-text-dim mb-1">Project Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 2026 Code Abatement Appeal"
                  className="w-full px-4 py-2.5 rounded-xl bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs text-fp-text-dim mb-1">Case Type</label>
                <select
                  value={caseType}
                  onChange={(e) => setCaseType(e.target.value as CaseType)}
                  className="w-full px-4 py-2.5 rounded-xl bg-fp-surface border border-fp-border text-sm text-fp-text outline-none focus:border-fp-blue focus:ring-2 focus:ring-fp-blue/10 transition-all"
                >
                  {CASE_TYPES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-fp-red/10 border border-fp-red/20 text-xs text-fp-red">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-fp-blue text-white text-sm font-semibold hover:shadow-lg hover:shadow-fp-blue/25 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 transition-all duration-200"
            >
              <Plus className="w-4 h-4" />
              <span>{creating ? "Creating Project…" : "Create & Launch Project"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
