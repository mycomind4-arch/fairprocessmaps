"use client";

import AgentAnalysisBanner from "@/components/AgentAnalysisBanner";

import { useState, useEffect, useCallback } from "react";
import { AutoSaveIndicator } from "@/components/AutoSaveIndicator";
import {
  ShieldAlert,
  Plus,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  FileText,
  Gavel,
  DollarSign,
  ChevronRight,
  X,
  BookOpen,
  TrendingDown,
  CircleDot,
} from "lucide-react";

// ── Types ──
interface EnforcementCase {
  id: string;
  project_id: string;
  case_number: string | null;
  violation_type: string;
  violation_description: string | null;
  severity: string;
  status: string;
  notice_served_date: string | null;
  notice_method: string | null;
  notice_period_days: number | null;
  compliance_deadline: string | null;
  abatement_date: string | null;
  abatement_cost: number | null;
  lien_filed: number;
  hearing_date: string | null;
  hearing_type: string | null;
  appeal_filed: number;
  appeal_date: string | null;
  outcome: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ── Maps ──
const VIOLATION_META: Record<string, { label: string; legalRef: string; defaultNoticeDays: number }> = {
  general_nuisance: { label: "General Nuisance", legalRef: "Gov. Code § 25845", defaultNoticeDays: 30 },
  substandard_housing: { label: "Substandard Housing", legalRef: "H&S Code § 17980", defaultNoticeDays: 60 },
  cannabis: { label: "Cannabis Cultivation", legalRef: "Gov. Code § 25403.5", defaultNoticeDays: 30 },
  dangerous_building: { label: "Dangerous Building", legalRef: "H&S Code § 17980", defaultNoticeDays: 30 },
  drug_house: { label: "Drug House", legalRef: "Gov. Code § 53069.82", defaultNoticeDays: 30 },
  other: { label: "Other Violation", legalRef: "", defaultNoticeDays: 30 },
};

const SEVERITY_META: Record<string, { label: string; color: string; bg: string }> = {
  minor: { label: "Minor", color: "text-fp-text-muted", bg: "bg-fp-surface-2" },
  moderate: { label: "Moderate", color: "text-fp-amber", bg: "bg-fp-amber/15" },
  major: { label: "Major", color: "text-fp-orange", bg: "bg-fp-orange/15" },
  critical: { label: "Critical", color: "text-fp-red", bg: "bg-fp-red/15" },
};

const STATUS_PIPELINE = [
  "open",
  "notice_served",
  "compliance_period",
  "hearing_scheduled",
  "abatement_pending",
  "appealed",
  "abated",
  "closed",
];

const STATUS_META: Record<string, { label: string; icon: typeof CircleDot }> = {
  open: { label: "Open", icon: CircleDot },
  notice_served: { label: "Notice Served", icon: FileText },
  compliance_period: { label: "Compliance Period", icon: Clock },
  hearing_scheduled: { label: "Hearing Scheduled", icon: Gavel },
  abatement_pending: { label: "Abatement Pending", icon: AlertTriangle },
  appealed: { label: "Appealed", icon: Gavel },
  abated: { label: "Abated", icon: CheckCircle2 },
  closed: { label: "Closed", icon: CheckCircle2 },
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
export default function CodeEnforcementPanel({ projectId }: { projectId: string }) {
  const [cases, setCases] = useState<EnforcementCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [selectedCase, setSelectedCase] = useState<EnforcementCase | null>(null);

  const fetchCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/enforcement?projectId=${projectId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json() as { items?: EnforcementCase[] };
      setCases(data.items ?? []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchCases();
  }, [fetchCases]);

  // Stats
  const openCount = cases.filter((c) => c.status !== "closed" && c.status !== "abated").length;
  const overdueCount = cases.filter((c) => {
    if (c.status === "closed" || c.status === "abated") return false;
    const days = daysUntil(c.compliance_deadline);
    return days !== null && days < 0;
  }).length;
  const totalCosts = cases.reduce((sum, c) => sum + (c.abatement_cost ?? 0), 0);
  const lienCount = cases.filter((c) => c.lien_filed).length;

  return (
    <div className="space-y-8 pb-12 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Code Enforcement</h1>
          <p className="text-sm text-fp-text-muted mt-1">Violation cases, notices, and enforcement actions</p>
          <div className="border-t border-fp-border mt-6" />
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Case
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        <StatTile label="Open Cases" value={openCount} icon={ShieldAlert} />
        <StatTile label="Overdue" value={overdueCount} icon={AlertTriangle} danger={overdueCount > 0} />
        <StatTile label="Abatement Costs" value={totalCosts > 0 ? `$${totalCosts.toLocaleString()}` : "$0"} icon={DollarSign} />
        <StatTile label="Liens Filed" value={lienCount} icon={FileText} />
      </div>

      {/* Agent analysis findings */}
      <AgentAnalysisBanner
        projectId={projectId}
        filterPrefixes={["statute_HCC_351_7", "statute_HCC_351_12", "statute_HCC_4_2", "statute_HCC_311_3", "statute_HCC_351_9", "statute_CA_Gov_Code_53069_4", "discrepancy_abatement_without_hearing", "discrepancy_missing_compliance_deadline", "discrepancy_missing_outcome"]}
        title="Enforcement-Related Agent Findings"
        description="Notice timing, hearing rights, and abatement statute checks"
      />

      {/* Cases list */}
      {loading ? (
        <div className="text-sm text-fp-text-dim text-center py-12">Loading enforcement cases…</div>
      ) : cases.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-fp-border bg-fp-surface/20 p-16 text-center">
          <ShieldAlert className="w-10 h-10 text-fp-text-dim mx-auto mb-4" />
          <h3 className="text-sm font-medium text-fp-text">No enforcement cases</h3>
          <p className="text-xs text-fp-text-dim mt-1 max-w-sm mx-auto">
            Add a code enforcement case to track notices, compliance deadlines, and due process requirements.
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add First Case
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {cases.map((c) => (
            <CaseCard key={c.id} caseData={c} onClick={() => setSelectedCase(c)} />
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <AddCaseModal
          projectId={projectId}
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            fetchCases();
          }}
        />
      )}

      {/* Detail modal */}
      {selectedCase && (
        <CaseDetailModal
          caseData={selectedCase}
          onClose={() => setSelectedCase(null)}
          onUpdate={fetchCases}
        />
      )}
    </div>
  );
}

// ── Stat Tile ──
function StatTile({ label, value, icon: Icon, danger }: { label: string; value: string | number; icon: typeof ShieldAlert; danger?: boolean }) {
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

// ── Case Card ──
function CaseCard({ caseData, onClick }: { caseData: EnforcementCase; onClick: () => void }) {
  const violation = VIOLATION_META[caseData.violation_type] ?? VIOLATION_META.other;
  const severity = SEVERITY_META[caseData.severity] ?? SEVERITY_META.moderate;
  const status = STATUS_META[caseData.status] ?? STATUS_META.open;
  const days = daysUntil(caseData.compliance_deadline);
  const isOverdue = days !== null && days < 0 && caseData.status !== "closed" && caseData.status !== "abated";
  const isUrgent = days !== null && days >= 0 && days <= 7 && caseData.status !== "closed" && caseData.status !== "abated";

  // Pipeline progress
  const currentStep = STATUS_PIPELINE.indexOf(caseData.status);

  return (
    <button
      onClick={onClick}
      className="w-full rounded-[14px] border border-fp-border bg-fp-surface/40 p-6 text-left hover:border-fp-border-hover hover:shadow-lg hover:shadow-black/20 transition-all duration-200"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-fp-text">{violation.label}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${severity.bg} ${severity.color}`}>
              {severity.label}
            </span>
          </div>
          {caseData.case_number && (
            <span className="text-xs text-fp-text-dim font-mono mt-0.5 block">Case #{caseData.case_number}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-medium px-2 py-1 rounded-md bg-fp-surface-2 text-fp-text-muted">
            {status.label}
          </span>
          <ChevronRight className="w-4 h-4 text-fp-text-dim" />
        </div>
      </div>

      {/* Description */}
      {caseData.violation_description && (
        <p className="text-sm text-fp-text-muted mb-3 line-clamp-2">{caseData.violation_description}</p>
      )}

      {/* Deadline / due process clock */}
      {caseData.compliance_deadline && caseData.status !== "closed" && caseData.status !== "abated" && (
        <div className={`flex items-center gap-2 text-xs mb-3 ${
          isOverdue ? "text-fp-red" : isUrgent ? "text-fp-amber" : "text-fp-text-dim"
        }`}>
          <Clock className="w-3.5 h-3.5" />
          {isOverdue ? (
            <span>Overdue by {Math.abs(days!)} days (deadline {fmtDate(caseData.compliance_deadline)})</span>
          ) : isUrgent ? (
            <span>{days} days remaining (deadline {fmtDate(caseData.compliance_deadline)})</span>
          ) : (
            <span>{days} days remaining · deadline {fmtDate(caseData.compliance_deadline)}</span>
          )}
        </div>
      )}

      {/* Pipeline visualization */}
      <div className="flex items-center gap-1">
        {STATUS_PIPELINE.map((step, i) => {
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

      {/* Legal reference link */}
      {violation.legalRef && (
        <div className="flex items-center gap-1.5 mt-2 text-[11px] text-fp-text-dim">
          <BookOpen className="w-3 h-3" />
          <span>{violation.legalRef}</span>
        </div>
      )}
    </button>
  );
}

// ── Add Case Modal ──
function AddCaseModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    violation_type: "general_nuisance",
    violation_description: "",
    severity: "moderate",
    case_number: "",
    notice_served_date: "",
    notice_method: "certified_mail",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const violation = VIOLATION_META[form.violation_type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/enforcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          violation_type: form.violation_type,
          violation_description: form.violation_description || undefined,
          severity: form.severity,
          case_number: form.case_number || undefined,
          notice_served_date: form.notice_served_date || undefined,
          notice_method: form.notice_method || undefined,
          notice_period_days: form.notice_served_date ? violation.defaultNoticeDays : undefined,
          status: form.notice_served_date ? "notice_served" : "open",
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to create case");
      onCreated();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Add Enforcement Case">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Violation type */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Violation Type</label>
          <select
            value={form.violation_type}
            onChange={(e) => setForm({ ...form, violation_type: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
          >
            {Object.entries(VIOLATION_META).map(([key, meta]) => (
              <option key={key} value={key}>
                {meta.label} ({meta.legalRef || "no statute"})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-fp-text-dim mt-1">
            Required notice period: <span className="text-fp-amber">{violation.defaultNoticeDays} days</span>
            {violation.legalRef && ` · ${violation.legalRef}`}
          </p>
        </div>

        {/* Case number */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Case Number (optional)</label>
          <input
            value={form.case_number}
            onChange={(e) => setForm({ ...form, case_number: e.target.value })}
            placeholder="e.g. CE-2026-0042"
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Violation Description</label>
          <textarea
            value={form.violation_description}
            onChange={(e) => setForm({ ...form, violation_description: e.target.value })}
            placeholder="Describe the violation…"
            rows={3}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan resize-none"
          />
        </div>

        {/* Severity + Notice date */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Severity</label>
            <select
              value={form.severity}
              onChange={(e) => setForm({ ...form, severity: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
            >
              {Object.entries(SEVERITY_META).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Notice Served Date</label>
            <input
              type="date"
              value={form.notice_served_date}
              onChange={(e) => setForm({ ...form, notice_served_date: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
            />
          </div>
        </div>

        {/* Notice method */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1.5 block">Notice Method</label>
          <select
            value={form.notice_method}
            onChange={(e) => setForm({ ...form, notice_method: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
          >
            <option value="certified_mail">Certified Mail</option>
            <option value="posting">Posting on Property</option>
            <option value="personal_service">Personal Service</option>
            <option value="publication">Publication</option>
          </select>
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
            {saving ? "Creating…" : "Create Case"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Case Detail Modal ──
function CaseDetailModal({
  caseData: initial,
  onClose,
  onUpdate,
}: {
  caseData: EnforcementCase;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [caseData, setCaseData] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState({ saving: false, saved: false, error: null as string | null });
  const violation = VIOLATION_META[caseData.violation_type] ?? VIOLATION_META.other;
  const severity = SEVERITY_META[caseData.severity] ?? SEVERITY_META.moderate;
  const days = daysUntil(caseData.compliance_deadline);
  const isOverdue = days !== null && days < 0 && caseData.status !== "closed" && caseData.status !== "abated";

  const updateStatus = async (newStatus: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/enforcement?id=${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const updated = (await res.json()) as EnforcementCase;
        setCaseData(updated);
        onUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const updateField = async (field: string, value: unknown) => {
    setSaveState({ saving: true, saved: false, error: null });
    try {
      const res = await fetch(`/api/v1/enforcement?id=${caseData.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const updated = (await res.json()) as EnforcementCase;
        setCaseData(updated);
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
    <Modal onClose={onClose} title={`${violation.label} · ${severity.label}`}>
      <div className="space-y-5">
        {/* Case info */}
        {caseData.case_number && (
          <div className="text-xs text-fp-text-dim font-mono">Case #{caseData.case_number}</div>
        )}

        {caseData.violation_description && (
          <p className="text-sm text-fp-text-muted">{caseData.violation_description}</p>
        )}

        {/* Due process clock */}
        {caseData.compliance_deadline && caseData.status !== "closed" && caseData.status !== "abated" && (
          <div className={`rounded-lg p-4 border ${
            isOverdue ? "border-fp-red/30 bg-fp-red/5" : "border-fp-border bg-fp-surface/40"
          }`}>
            <div className="flex items-center gap-2 mb-1">
              <Clock className={`w-4 h-4 ${isOverdue ? "text-fp-red" : "text-fp-amber"}`} />
              <span className="text-xs font-medium text-fp-text-dim">Compliance Deadline</span>
            </div>
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-bold text-fp-text">{fmtDate(caseData.compliance_deadline)}</span>
              <span className={`text-sm font-medium ${isOverdue ? "text-fp-red" : days! <= 7 ? "text-fp-amber" : "text-fp-text-muted"}`}>
                {isOverdue ? `${Math.abs(days!)} days overdue` : `${days} days remaining`}
              </span>
            </div>
            <div className="text-[11px] text-fp-text-dim mt-1">
              Notice period: {caseData.notice_period_days ?? violation.defaultNoticeDays} days · Served: {fmtDate(caseData.notice_served_date)}
            </div>
          </div>
        )}

        {/* Status pipeline */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-2 block">Status</label>
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_PIPELINE.map((step, i) => {
              const currentIdx = STATUS_PIPELINE.indexOf(caseData.status);
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

        {/* Details grid — editable, auto-saves on blur */}
        <div className="grid grid-cols-2 gap-3">
          <EditableField label="Notice Served" type="date" value={caseData.notice_served_date ?? ""} icon={FileText}
            onSave={(v) => updateField("notice_served_date", v || null)} />
          <EditableSelect label="Notice Method" value={caseData.notice_method ?? ""} icon={FileText}
            options={[["certified_mail", "Certified Mail"], ["posting", "Posting on Property"], ["personal_service", "Personal Service"], ["publication", "Publication"]]}
            onSave={(v) => updateField("notice_method", v || null)} />
          <EditableField label="Hearing Date" type="date" value={caseData.hearing_date ?? ""} icon={Gavel}
            onSave={(v) => updateField("hearing_date", v || null)} />
          <EditableField label="Hearing Type" type="text" value={caseData.hearing_type ?? ""} icon={Gavel}
            onSave={(v) => updateField("hearing_type", v || null)} />
          <EditableField label="Abatement Cost" type="number" value={caseData.abatement_cost ?? ""} icon={DollarSign}
            onSave={(v) => updateField("abatement_cost", v ? parseFloat(v) : null)} prefix="$" />
          <EditableSelect label="Lien Filed" value={caseData.lien_filed ? "1" : "0"} icon={FileText}
            options={[["0", "No"], ["1", "Yes"]]}
            onSave={(v) => updateField("lien_filed", v === "1")} />
          <EditableSelect label="Appeal Filed" value={caseData.appeal_filed ? "1" : "0"} icon={Gavel}
            options={[["0", "No"], ["1", "Yes"]]}
            onSave={(v) => updateField("appeal_filed", v === "1")} />
          <EditableField label="Appeal Date" type="date" value={caseData.appeal_date ?? ""} icon={Calendar}
            onSave={(v) => updateField("appeal_date", v || null)} />
        </div>

        {/* Legal reference */}
        {violation.legalRef && (
          <div className="rounded-lg border border-fp-border bg-fp-surface/20 p-3 flex items-start gap-2">
            <BookOpen className="w-4 h-4 text-fp-cyan shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-medium text-fp-text">Legal Reference</div>
              <div className="text-xs text-fp-text-dim mt-0.5">{violation.legalRef}</div>
              <p className="text-[11px] text-fp-text-dim mt-1">
                Required notice period: {violation.defaultNoticeDays} days.
                Check the Legal &amp; Law Library for full statute details.
              </p>
            </div>
          </div>
        )}

        {/* Notes — always show, editable */}
        <div>
          <label className="text-xs font-medium text-fp-text-dim mb-1 block">Notes</label>
          <textarea
            defaultValue={caseData.notes ?? ""}
            placeholder="Add notes…"
            rows={3}
            onBlur={(e) => {
              if (e.target.value !== (caseData.notes ?? "")) {
                updateField("notes", e.target.value || null);
              }
            }}
            className="w-full px-3 py-2 rounded-lg bg-fp-surface border border-fp-border text-sm text-fp-text placeholder:text-fp-text-dim focus:outline-none focus:border-fp-cyan resize-none"
          />
        </div>

        {/* Outcome */}
        {caseData.outcome && (
          <div>
            <label className="text-xs font-medium text-fp-text-dim mb-1 block">Outcome</label>
            <p className="text-sm text-fp-text-muted">{caseData.outcome}</p>
          </div>
        )}
      </div>
    </Modal>
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
    : value === "" || (value === 0 && type !== "number")
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

// ── Editable Select (auto-saves on change) ──
function EditableSelect({
  label, value, icon: Icon, options, onSave,
}: {
  label: string;
  value: string;
  icon: typeof FileText;
  options: [string, string][];
  onSave: (value: string) => void;
}) {
  const display = options.find(([k]) => k === value)?.[1] ?? value ?? "—";
  return (
    <div className="rounded-[14px] border border-fp-border bg-fp-surface/40 p-6 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-fp-text-dim" />
        <span className="text-xs text-fp-text-dim uppercase tracking-wide font-medium">{label}</span>
      </div>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        className="w-full px-2 py-1 rounded bg-fp-surface-2 border border-fp-border text-sm text-fp-text focus:outline-none focus:border-fp-cyan"
      >
        <option value="">—</option>
        {options.map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
    </div>
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

// ── Modal wrapper ──
function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose} role="button" tabIndex={0} aria-label="Close modal">
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
