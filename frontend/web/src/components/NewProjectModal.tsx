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

export default function NewProjectModal({ propertyId, propertyLabel, onClose, onOpenProject }: NewProjectModalProps) {
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
      const project = await res.json() as Project;
      if (!project?.id) throw new Error("Server did not return a project id");
      onOpenProject(project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-fp-bg/70 backdrop-blur-sm">
      <div className="w-[420px] rounded-2xl glass p-5 animate-[scale-in_0.25s_cubic-bezier(0.16,1,0.3,1)_forwards]">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold text-fp-text">Open as project</h2>
          <button onClick={onClose} className="text-fp-text-dim hover:text-fp-text">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-fp-text-dim mb-4">{propertyLabel}</p>

        {loading && <div className="text-xs text-fp-text-muted py-4 text-center">Checking for existing projects…</div>}

        {!loading && existing && existing.length > 0 && (
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wide text-fp-text-dim mb-2">Existing projects</div>
            <div className="flex flex-col gap-1.5">
              {existing.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onOpenProject(p.id)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-fp-surface-2 hover:bg-fp-surface-2/80 text-left text-sm text-fp-text transition-all"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-fp-cyan shrink-0" />
                  <span className="flex-1">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-fp-blue/15 text-fp-text-muted capitalize">
                    {p.status}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {!loading && (
          <div>
            <div className="text-[11px] uppercase tracking-wide text-fp-text-dim mb-2">New project</div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. 2026 Cannabis Abatement"
              className="w-full px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-sm text-fp-text mb-2 outline-none focus:border-fp-blue"
            />
            <select
              value={caseType}
              onChange={(e) => setCaseType(e.target.value as CaseType)}
              className="w-full px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-sm text-fp-text mb-3 outline-none focus:border-fp-blue"
            >
              {CASE_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {error && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                {error}
              </div>
            )}
            <button
              onClick={handleCreate}
              disabled={!name.trim() || creating}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium disabled:opacity-40 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              {creating ? "Creating…" : "Create & open project"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
