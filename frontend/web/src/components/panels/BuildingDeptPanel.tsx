"use client";

import AgentAnalysisBanner from "@/components/AgentAnalysisBanner";

import { useState, useEffect, useCallback } from "react";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import {
  Building2,
  Plus,
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  ChevronRight,
  ClipboardCheck,
  Calendar,
  DollarSign,
  HardHat,
  CircleDot,
} from "lucide-react";

// ── Types ──
interface Permit {
  id: string;
  project_id: string;
  permit_number: string | null;
  permit_type: string;
  permit_status: string;
  description: string | null;
  valuation: number | null;
  sqft: number | null;
  issued_date: string | null;
  expired_date: string | null;
  finalized_date: string | null;
  assigned_inspector: string | null;
  inspections_count: number;
  last_inspection_date: string | null;
  last_inspection_result: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Maps ──
const PERMIT_TYPES: Record<string, { label: string; icon: typeof Building2 }> = {
  building: { label: "Building Permit", icon: Building2 },
  electrical: { label: "Electrical Permit", icon: HardHat },
  plumbing: { label: "Plumbing Permit", icon: HardHat },
  mechanical: { label: "Mechanical Permit", icon: HardHat },
  demolition: { label: "Demolition Permit", icon: HardHat },
  grading: { label: "Grading Permit", icon: HardHat },
  adr: { label: "Admin Review", icon: ClipboardCheck },
  other: { label: "Other Permit", icon: FileText },
};

const PERMIT_PIPELINE = [
  "pending",
  "under_review",
  "issued",
  "inspections",
  "finalized",
  "expired",
  "denied",
];

const STATUS_META: Record<string, { label: string; color: string; icon: typeof CircleDot }> = {
  pending: { label: "Pending", color: "text-fp-text-dim", icon: CircleDot },
  under_review: { label: "Under Review", color: "text-fp-amber", icon: Clock },
  issued: { label: "Issued", color: "text-fp-cyan", icon: FileText },
  inspections: { label: "Inspections", color: "text-fp-cyan", icon: ClipboardCheck },
  finalized: { label: "Finalized", color: "text-fp-green", icon: CheckCircle2 },
  expired: { label: "Expired", color: "text-fp-red", icon: AlertTriangle },
  denied: { label: "Denied", color: "text-fp-red", icon: X },
};

const INSPECTION_RESULTS: Record<string, { label: string; color: string }> = {
  passed: { label: "Passed", color: "text-fp-green" },
  failed: { label: "Failed", color: "text-fp-red" },
  partial: { label: "Partial", color: "text-fp-amber" },
  corrections_needed: { label: "Corrections Needed", color: "text-fp-amber" },
};

// ── Helpers ──
function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Component ──
export default function BuildingDeptPanel({ projectId }: { projectId: string }) {
  const [permits, setPermits] = useState<Permit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<Permit | null>(null);

  const fetchPermits = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/permits?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json() as { items?: Permit[] };
      setPermits(data.items ?? []);
    } catch {
      setPermits([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchPermits();
  }, [fetchPermits]);

  // Stats
  const activeCount = permits.filter((p) => p.permit_status !== "finalized" && p.permit_status !== "expired" && p.permit_status !== "denied").length;
  const expiredCount = permits.filter((p) => {
    if (p.permit_status === "finalized" || p.permit_status === "denied") return false;
    const days = daysUntil(p.expired_date);
    return days !== null && days < 0;
  }).length;
  const inspectionsTotal = permits.reduce((sum, p) => sum + (p.inspections_count ?? 0), 0);
  const totalValuation = permits.reduce((sum, p) => sum + (p.valuation ?? 0), 0);

  return (
    <div className="space-y-8 pb-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Building Department</h1>
          <p className="text-sm text-fp-text-muted mt-1">Permits, inspections, and building compliance</p>
          <div className="border-t border-fp-border mt-6" />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Permit
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Active Permits" value={activeCount} icon={Building2} />
        <StatTile label="Expired" value={expiredCount} icon={AlertTriangle} danger={expiredCount > 0} />
        <StatTile label="Inspections" value={inspectionsTotal} icon={ClipboardCheck} />
        <StatTile label="Total Valuation" value={totalValuation > 0 ? `$${totalValuation.toLocaleString()}` : "$0"} icon={DollarSign} />
      </div>

      {/* Permits list */}
      {loading ? (
        <div className="text-sm text-fp-text-dim text-center py-12">Loading permits…</div>
      ) : permits.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-fp-border bg-fp-surface/20 p-16 text-center">
          <Building2 className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No permits on file</h3>
          <p className="text-xs text-fp-text-dim mt-1 max-w-sm mx-auto">
            Add a building permit to track inspections, compliance, and valuation.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First Permit
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {permits.map((p) => (
            <PermitCard key={p.id} permit={p} onClick={() => setSelectedPermit(p)} />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddPermitModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            fetchPermits();
          }}
        />
      )}

      {/* Detail modal */}
      {selectedPermit && (
        <PermitDetailModal
          permit={selectedPermit}
          onClose={() => setSelectedPermit(null)}
          onUpdate={fetchPermits}
        />
      )}
    </div>
  );
}

// ── Stat Tile ──
function StatTile({ label, value, icon: Icon, danger }: { label: string; value: string | number; icon: typeof Building2; danger?: boolean }) {
  return (
    <div className="rounded-[14px] border border-fp-border bg-fp-surface/40 p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${danger ? "text-fp-red" : "text-fp-text-dim"}`} />
        <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">{label}</span>
      </div>
      <span className={`text-xl font-semibold ${danger ? "text-fp-red" : "text-fp-text"}`}>{value}</span>
    </div>
  );
}

// ── Permit Card ──
function PermitCard({ permit, onClick }: { permit: Permit; onClick: () => void }) {
  const typeMeta = PERMIT_TYPES[permit.permit_type] ?? PERMIT_TYPES.other;
  const status = STATUS_META[permit.permit_status] ?? STATUS_META.pending;
  const TypeIcon = typeMeta.icon;
  const StatusIcon = status.icon;
  const days = daysUntil(permit.expired_date);
  const isExpired = days !== null && days < 0 && permit.permit_status !== "finalized" && permit.permit_status !== "denied";
  const isExpiringSoon = days !== null && days >= 0 && days <= 14 && permit.permit_status !== "finalized" && permit.permit_status !== "denied";
  const currentStep = PERMIT_PIPELINE.indexOf(permit.permit_status);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-[14px] border border-fp-border bg-fp-surface/40 p-6 text-left hover:border-fp-border-hover hover:shadow-lg hover:shadow-black/20 transition-all duration-200"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-fp-surface-2 flex items-center justify-center shrink-0">
            <TypeIcon className="w-4 h-4 text-fp-text-dim" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-fp-text">{typeMeta.label}</span>
            {permit.permit_number && (
              <span className="text-xs text-fp-text-dim font-mono ml-2">#{permit.permit_number}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-medium px-2 py-1 rounded-md bg-fp-surface-2 ${status.color}`}>
            {status.label}
          </span>
          <ChevronRight className="w-4 h-4 text-fp-text-dim" />
        </div>
      </div>

      {/* Description */}
      {permit.description && (
        <p className="text-sm text-fp-text-muted mb-3 line-clamp-2">{permit.description}</p>
      )}

      {/* Expiry warning */}
      {permit.expired_date && permit.permit_status !== "finalized" && permit.permit_status !== "denied" && (
        <div className={`flex items-center gap-2 text-xs mb-3 ${
          isExpired ? "text-fp-red" : isExpiringSoon ? "text-fp-amber" : "text-fp-text-dim"
        }`}>
          <Clock className="w-3.5 h-3.5" />
          {isExpired ? (
            <span>Expired {Math.abs(days!)} days ago ({fmtDate(permit.expired_date)})</span>
          ) : isExpiringSoon ? (
            <span>Expires in {days} days ({fmtDate(permit.expired_date)})</span>
          ) : (
            <span>Expires {fmtDate(permit.expired_date)}</span>
          )}
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-4 text-xs text-fp-text-dim mb-3">
        {permit.valuation != null && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            ${(permit.valuation).toLocaleString()}
          </span>
        )}
        {permit.sqft != null && (
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            {permit.sqft.toLocaleString()} sqft
          </span>
        )}
        {permit.inspections_count > 0 && (
          <span className="flex items-center gap-1">
            <ClipboardCheck className="w-3 h-3" />
            {permit.inspections_count} inspection{permit.inspections_count !== 1 ? "s" : ""}
          </span>
        )}
        {permit.assigned_inspector && (
          <span className="flex items-center gap-1">
            <HardHat className="w-3 h-3" />
            {permit.assigned_inspector}
          </span>
        )}
      </div>

      {/* Pipeline visualization */}
      <div className="flex items-center gap-1">
        {PERMIT_PIPELINE.map((step, i) => {
          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          const stepMeta = STATUS_META[step];
          const StepIcon = stepMeta.icon;
          return (
            <div key={step} className="flex items-center">
              {i > 0 && <div className={`w-4 h-px ${isDone || isCurrent ? "bg-fp-blue/40" : "bg-fp-border"}`} />}
              <div
                className={`flex items-center justify-center w-5 h-5 rounded-full transition-colors ${
                  isDone
                    ? "bg-fp-blue/20 text-fp-blue"
                    : isCurrent
                    ? "bg-fp-blue text-white"
                    : "bg-fp-surface-2 text-fp-text-dim"
                }`}
                title={stepMeta.label}
              >
                <StepIcon className="w-3 h-3" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Last inspection result */}
      {permit.last_inspection_result && (
        <div className="mt-2 text-[11px]">
          <span className="text-fp-text-dim">Last inspection: </span>
          <span className={(INSPECTION_RESULTS[permit.last_inspection_result] ?? { color: "text-fp-text-dim" }).color}>
            {(INSPECTION_RESULTS[permit.last_inspection_result] ?? { label: permit.last_inspection_result }).label}
          </span>
          {permit.last_inspection_date && (
            <span className="text-fp-text-dim"> · {fmtDate(permit.last_inspection_date)}</span>
          )}
        </div>
      )}
    </button>
  );
}

// ── Add Permit Modal ──
function AddPermitModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    permit_type: "building",
    permit_number: "",
    description: "",
    valuation: "",
    sqft: "",
    issued_date: "",
    assigned_inspector: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/permits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          permit_type: form.permit_type,
          permit_number: form.permit_number || undefined,
          description: form.description || undefined,
          valuation: form.valuation ? parseFloat(form.valuation) : undefined,
          sqft: form.sqft ? parseFloat(form.sqft) : undefined,
          issued_date: form.issued_date || undefined,
          permit_status: form.issued_date ? "issued" : "pending",
          assigned_inspector: form.assigned_inspector || undefined,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create permit");
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Add Building Permit">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Permit type */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Permit Type</label>
          <select
            value={form.permit_type}
            onChange={(e) => setForm({ ...form, permit_type: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
          >
            {Object.entries(PERMIT_TYPES).map(([key, meta]) => (
              <option key={key} value={key}>{meta.label}</option>
            ))}
          </select>
        </div>

        {/* Permit number */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Permit Number (optional)</label>
          <input
            value={form.permit_number}
            onChange={(e) => setForm({ ...form, permit_number: e.target.value })}
            placeholder="e.g. BLD-2026-0123"
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What is being built/modified?"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan resize-none"
          />
        </div>

        {/* Valuation + SQFT */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Valuation ($)</label>
            <input
              type="number"
              value={form.valuation}
              onChange={(e) => setForm({ ...form, valuation: e.target.value })}
              placeholder="50000"
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Square Footage</label>
            <input
              type="number"
              value={form.sqft}
              onChange={(e) => setForm({ ...form, sqft: e.target.value })}
              placeholder="1200"
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan"
            />
          </div>
        </div>

        {/* Issue date + Inspector */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Issue Date</label>
            <input
              type="date"
              value={form.issued_date}
              onChange={(e) => setForm({ ...form, issued_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
            />
            <p className="text-[11px] text-fp-text-dim mt-1">Auto-expires in 180 days</p>
          </div>
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Assigned Inspector</label>
            <input
              value={form.assigned_inspector}
              onChange={(e) => setForm({ ...form, assigned_inspector: e.target.value })}
              placeholder="Name"
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Notes (optional)</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Additional notes…"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan resize-none"
          />
        </div>

        {error && <p className="text-xs text-fp-red">{error}</p>}

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create Permit"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Permit Detail Modal ──
function PermitDetailModal({
  permit: initial,
  onClose,
  onUpdate,
}: {
  permit: Permit;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [permit, setPermit] = useState(initial);
  const [saving, setSaving] = useState(false);
  const typeMeta = PERMIT_TYPES[permit.permit_type] ?? PERMIT_TYPES.other;
  const status = STATUS_META[permit.permit_status] ?? STATUS_META.pending;
  const days = daysUntil(permit.expired_date);
  const isExpired = days !== null && days < 0 && permit.permit_status !== "finalized" && permit.permit_status !== "denied";

  const [saveState, setSaveState] = useState({ saving: false, saved: false, error: null as string | null });

  const updateStatus = async (newStatus: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/permits?id=${permit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permit_status: newStatus }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Permit;
        setPermit(updated);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (field: string, value: unknown) => {
    setSaveState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch(`/api/v1/permits?id=${permit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Permit;
        setPermit(updated);
        onUpdate();
        setSaveState({ saving: false, saved: true, error: null });
        setTimeout(() => setSaveState((s) => ({ ...s, saved: false })), 2000);
      } else {
        setSaveState({ saving: false, saved: false, error: "Save failed" });
      }
    } catch (e: any) {
      setSaveState({ saving: false, saved: false, error: e.message });
    }
  };

  return (
    <Modal onClose={onClose} title={`${typeMeta.label}`}>
      <div className="space-y-5">
        {/* Permit info */}
        {permit.permit_number && (
          <div className="text-xs text-fp-text-dim font-mono">Permit #{permit.permit_number}</div>
        )}

        {permit.description && (
          <p className="text-sm text-fp-text-muted">{permit.description}</p>
        )}

        {/* Expiry warning */}
        {permit.expired_date && permit.permit_status !== "finalized" && permit.permit_status !== "denied" && (
          <div className={`rounded-lg p-4 border ${
            isExpired ? "border-fp-red/30 bg-fp-red/5" : days! <= 14 ? "border-fp-amber/30 bg-fp-amber/5" : "border-fp-border bg-fp-surface/40"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`w-4 h-4 ${isExpired ? "text-fp-red" : "text-fp-amber"}`} />
              <span className="text-xs font-medium text-fp-text-dim">Permit Expiry</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-fp-text">{fmtDate(permit.expired_date)}</span>
              <span className={`text-sm font-medium ${isExpired ? "text-fp-red" : days! <= 14 ? "text-fp-amber" : "text-fp-text-muted"}`}>
                {isExpired ? `Expired ${Math.abs(days!)} days ago` : `${days} days remaining`}
              </span>
            </div>
            <div className="text-[11px] text-fp-text-dim mt-1">
              Issued: {fmtDate(permit.issued_date)} · Auto-expires 180 days from issue
            </div>
          </div>
        )}

        {/* Status pipeline */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-2 block">Status</label>
          <div className="flex items-center gap-1 flex-wrap">
            {PERMIT_PIPELINE.map((step, i) => {
              const currentIdx = PERMIT_PIPELINE.indexOf(permit.permit_status);
              const isDone = i < currentIdx;
              const isCurrent = i === currentIdx;
              const stepMeta = STATUS_META[step];
              const StepIcon = stepMeta.icon;
              return (
                <button
                  key={step}
                  onClick={() => updateStatus(step)}
                  disabled={saving}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-fp-blue text-white"
                      : isDone
                      ? "bg-fp-blue/15 text-fp-blue"
                      : "bg-fp-surface-2 text-fp-text-dim hover:text-fp-text"
                  }`}
                >
                  <StepIcon className="w-3 h-3" />
                  {stepMeta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3">
          <EditableField label="Issued Date" type="date" value={permit.issued_date ?? ""} icon={Calendar}
            onSave={(v) => updateField("issued_date", v || null)} />
          <EditableField label="Finalized Date" type="date" value={permit.finalized_date ?? ""} icon={CheckCircle2}
            onSave={(v) => updateField("finalized_date", v || null)} />
          <EditableField label="Valuation" type="number" value={permit.valuation ?? ""} icon={DollarSign}
            onSave={(v) => updateField("valuation", v ? parseFloat(v) : null)} prefix="$" />
          <EditableField label="Square Footage" type="number" value={permit.sqft ?? ""} icon={Building2}
            onSave={(v) => updateField("sqft", v ? parseFloat(v) : null)} suffix=" sqft" />
          <EditableField label="Inspector" type="text" value={permit.assigned_inspector ?? ""} icon={HardHat}
            onSave={(v) => updateField("assigned_inspector", v || null)} />
          <EditableField label="Inspections" type="number" value={permit.inspections_count ?? 0} icon={ClipboardCheck}
            onSave={(v) => updateField("inspections_count", v ? parseInt(v) : 0)} />
        </div>

        {/* Last inspection */}
        {permit.last_inspection_result && (
          <div className="rounded-lg border border-fp-border bg-fp-surface/20 p-3">
            <div className="text-xs font-medium text-fp-text mb-1">Last Inspection</div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-medium ${
                (INSPECTION_RESULTS[permit.last_inspection_result] ?? { color: "text-fp-text" }).color
              }`}>
                {(INSPECTION_RESULTS[permit.last_inspection_result] ?? { label: permit.last_inspection_result }).label}
              </span>
              {permit.last_inspection_date && (
                <span className="text-xs text-fp-text-dim">{fmtDate(permit.last_inspection_date)}</span>
              )}
            </div>
          </div>
        )}

        {/* Notes — always show, editable */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1 block">Notes</label>
          <textarea
            defaultValue={permit.notes ?? ""}
            placeholder="Add notes…"
            rows={3}
            onBlur={(e) => {
              if (e.target.value !== (permit.notes ?? "")) {
                updateField("notes", e.target.value || null);
              }
            }}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan resize-none"
          />
        </div>
      </div>
    </Modal>
  );
}

// ── Detail Field ──
function DetailField({ label, value, icon: Icon }: { label: string; value: string; icon: typeof FileText }) {
  return (
    <div className="rounded-[14px] border border-fp-border bg-fp-surface/40 p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-fp-text-dim" />
        <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">{label}</span>
      </div>
      <span className="text-sm text-fp-text">{value}</span>
    </div>
  );
}


// ── Editable Field (auto-saves on blur) ──
function EditableField({
  label, type = "text", value, icon: Icon, onSave, prefix, suffix,
}: {
  label: string;
  type?: string;
  value: string | number;
  icon: typeof FileText;
  onSave: (value: string) => void;
  prefix?: string;
  suffix?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  const display = type === "date" && value
    ? fmtDate(value as string)
    : value === "" || value === 0 && type !== "number"
    ? "—"
    : `${prefix ?? ""}${value}${suffix ?? ""}`;

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(String(value)); setEditing(true); }}
        className="w-full text-left rounded-lg border border-fp-border bg-fp-surface/40 p-3 hover:border-fp-cyan/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Icon className="w-3 h-3 text-fp-text-dim" />
          <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">{label}</span>
        </div>
        <span className="text-sm text-fp-text">{display}</span>
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-fp-cyan/40 bg-fp-surface p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-fp-cyan" />
        <span className="text-[11px] text-fp-cyan font-medium">{label}</span>
      </div>
      <input
        type={type}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft !== String(value)) onSave(draft); }}
        onKeyDown={(e) => { if (e.key === "Enter") { setEditing(false); if (draft !== String(value)) onSave(draft); } if (e.key === "Escape") setEditing(false); }}
        className="w-full px-2 py-1 rounded bg-fp-surface-2 border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
      />
    </div>
  );
}

// ── Modal wrapper ──
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-fp-surface border border-fp-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-fp-surface border-b border-fp-border px-5 py-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fp-text">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-fp-text-dim hover:text-fp-text hover:bg-fp-surface-2">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
