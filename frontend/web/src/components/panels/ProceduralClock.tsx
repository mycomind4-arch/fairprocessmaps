"use client";

import { usePanelData, PanelLoading, PanelError } from "./PanelDataWrapper";

export function ProceduralClockPanel({ projectId }: { projectId: string }) {
  const { items, findings, loading, error, fetchData } = usePanelData(projectId);
  if (loading) return <PanelLoading label="Loading procedural clock…" />;
  if (error) return <PanelError error={error} onRetry={fetchData} />;
  return <ProceduralClock items={items} findings={findings} />;
}

import { useMemo, useState } from "react";
import {
  Clock, AlertTriangle, ShieldCheck, ShieldAlert,
  CheckCircle2, XCircle, ChevronRight, ChevronDown,
  Gavel, Mail, Calendar, FileText, Scale,
} from "lucide-react";
import {
  STATUTES, evaluateDeadline, type StatuteRule,
} from "@/lib/statutes";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  created_at: string;
}

// Map event types to procedural steps
const PROCEDURAL_SEQUENCE = [
  { types: ["project_created", "intelligence_gathered"], step: "complaint", label: "Complaint / Intake", icon: FileText },
  { types: ["inspection"], step: "inspection", label: "Inspection", icon: ShieldCheck },
  { types: ["notice_sent", "correspondence"], step: "notice", label: "Notice Issued", icon: Mail },
  { types: ["hearing_held"], step: "hearing", label: "Hearing", icon: Gavel },
  { types: ["appeal_filed"], step: "appeal", label: "Appeal", icon: Scale },
  { types: ["decision"], step: "decision", label: "Final Decision", icon: CheckCircle2 },
  { types: ["fine_imposed", "lien_filed", "abatement"], step: "enforcement", label: "Enforcement Action", icon: ShieldAlert },
];

// Map procedural transitions to applicable statutes
const TRANSITION_STATUTES: Record<string, string[]> = {
  "inspection→notice": ["HCC § 4.2"], // Notice posted within 5 business days
  "notice→hearing": ["HCC § 351-12", "HCC § 311-3"], // 10 days notice, 30 days for nuisance
  "hearing→appeal": ["CA Gov Code § 53069.4", "CA Gov Code § 65905"], // 10 days to appeal
  "hearing→decision": ["CA Gov Code § 65863.3"], // 30 days notification
  "decision→enforcement": ["HCC § 351-9"], // 5 business days recording
  "notice→enforcement": ["HCC § 311-3"], // 30 days abatement notice
  "appeal→decision": ["CA Gov Code § 65863.3"], // 30 days
  "complaint→inspection": [], // No specific statutory deadline
};

interface DeadlineCheck {
  fromStep: string;
  toStep: string;
  fromDate: string;
  toDate: string;
  statute: StatuteRule | null;
  status: "compliant" | "violation" | "unknown" | "pending";
  elapsedDays: number;
  requiredDays: number;
  note: string;
}

export default function ProceduralClock({
  items,
  findings,
}: {
  items: TimelineItem[];
  findings: Finding[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Build the procedural sequence from timeline events
  const proceduralSteps = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.event_date.localeCompare(b.event_date));
    const steps: { step: string; label: string; date: string; event: TimelineItem; icon: typeof FileText }[] = [];

    for (const item of sorted) {
      const seq = PROCEDURAL_SEQUENCE.find((s) => s.types.includes(item.event_type));
      if (seq) {
        // Only take the first occurrence of each procedural step
        if (!steps.find((s) => s.step === seq.step)) {
          steps.push({
            step: seq.step,
            label: seq.label,
            date: item.event_date,
            event: item,
            icon: seq.icon,
          });
        }
      }
    }
    return steps;
  }, [items]);

  // Check deadlines between consecutive procedural steps
  const deadlineChecks = useMemo(() => {
    const checks: DeadlineCheck[] = [];
    for (let i = 0; i < proceduralSteps.length - 1; i++) {
      const from = proceduralSteps[i];
      const to = proceduralSteps[i + 1];
      const transitionKey = `${from.step}→${to.step}`;
      const applicableStatuteRefs = TRANSITION_STATUTES[transitionKey] || [];

      for (const ref of applicableStatuteRefs) {
        const statute = STATUTES.find((s) => s.ref === ref);
        if (!statute) continue;

        const result = evaluateDeadline(from.date, to.date, statute);
        checks.push({
          fromStep: from.step,
          toStep: to.step,
          fromDate: from.date,
          toDate: to.date,
          statute,
          status: result.status === "matches expected window" ? "compliant" : result.status === "deviation detected" ? "violation" : "unknown",
          elapsedDays: result.elapsedDays,
          requiredDays: statute.deadline_value,
          note: result.note,
        });
      }

      // If no statutes apply, still record the gap
      if (applicableStatuteRefs.length === 0) {
        const elapsed = Math.round((new Date(to.date).getTime() - new Date(from.date).getTime()) / 86400000);
        checks.push({
          fromStep: from.step,
          toStep: to.step,
          fromDate: from.date,
          toDate: to.date,
          statute: null,
          status: "pending",
          elapsedDays: elapsed,
          requiredDays: 0,
          note: `${elapsed} days between ${from.label} and ${to.label}. No specific statutory deadline applies.`,
        });
      }
    }

    // Check for missing steps (pending deadlines)
    const completedSteps = new Set(proceduralSteps.map((s) => s.step));
    // (dead code removed — expectedOrder was unused)

    return checks;
  }, [proceduralSteps]);

  // Stats
  const stats = useMemo(() => {
    const violations = deadlineChecks.filter((c) => c.status === "violation");
    const compliant = deadlineChecks.filter((c) => c.status === "compliant");
    const pending = deadlineChecks.filter((c) => c.status === "pending");
    return {
      total: deadlineChecks.length,
      violations: violations.length,
      compliant: compliant.length,
      pending: pending.length,
    };
  }, [deadlineChecks]);

  if (proceduralSteps.length < 2) {
    return (
      <div className="glass rounded-xl p-6 border-fp-border shadow-lg shadow-black/20">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-fp-blue" />
          <h3 className="text-sm font-semibold text-fp-text">Procedural Clock</h3>
        </div>
        <p className="text-xs text-fp-text-muted">
          Need at least 2 procedural events to analyze statutory deadlines. Add more events
          (notices, hearings, appeals, decisions) to activate the procedural compliance engine.
        </p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 border-fp-border shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-fp-blue" />
          <h3 className="text-sm font-semibold text-fp-text">Procedural Clock</h3>
          <span className="text-xs text-fp-text-dim">— statutory deadline compliance engine</span>
        </div>
        <div className="flex items-center gap-2">
          {stats.violations > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-fp-red/15 text-fp-red border border-fp-red/30 font-medium">
              {stats.violations} Deadline Issues
            </span>
          )}
          {stats.compliant > 0 && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-fp-green/15 text-fp-green border border-fp-green/30 font-medium">
              {stats.compliant} Compliant
            </span>
          )}
        </div>
      </div>

      {/* Procedural Timeline Visualization */}
      <div className="relative">
        {/* Horizontal connection line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-fp-border" />

        {/* Step nodes */}
        <div className="relative flex items-start justify-between gap-1 overflow-x-auto pb-2">
          {proceduralSteps.map((step, idx) => {
            const StepIcon = step.icon;
            // Check if any violation involves this step
            const hasViolation = deadlineChecks.some(
              (c) => (c.fromStep === step.step || c.toStep === step.step) && c.status === "violation"
            );
            return (
              <div key={idx} className="flex flex-col items-center gap-1 shrink-0 min-w-[80px]">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center bg-fp-surface relative z-10 ${
                    hasViolation
                      ? "border-fp-red text-fp-red"
                      : "border-fp-border text-fp-text-muted"
                  }`}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-medium text-fp-text text-center leading-tight">
                  {step.label}
                </div>
                <div className="text-[10px] font-mono text-fp-text-dim">
                  {step.date}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deadline Checks */}
      <div className="space-y-2">
        {deadlineChecks.map((check, idx) => {
          const isViolation = check.status === "violation";
          const isCompliant = check.status === "compliant";
          const isExpanded = expanded === `${idx}`;
          const StatusIcon = isViolation ? XCircle : isCompliant ? CheckCircle2 : Clock;
          const statusColor = isViolation ? "text-fp-red" : isCompliant ? "text-fp-green" : "text-fp-text-dim";
          const bgColor = isViolation ? "bg-fp-red/5 border-fp-red/20" : isCompliant ? "bg-fp-green/5 border-fp-green/20" : "bg-fp-surface-2/40 border-fp-border/40";

          return (
            <div key={idx} className={`rounded-lg border ${bgColor} overflow-hidden`}>
              <div
                onClick={() => setExpanded(isExpanded ? null : `${idx}`)}
                className="flex items-center gap-3 p-3 cursor-pointer hover:bg-fp-surface-2/40 transition-colors"
              >
                <StatusIcon className={`w-4 h-4 shrink-0 ${statusColor}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-fp-text">
                      {check.fromStep} → {check.toStep}
                    </span>
                    {check.statute && (
                      <span className="text-[10px] font-mono text-fp-text-dim bg-fp-surface-2 px-1.5 py-0.5 rounded border border-fp-border/40">
                        {check.statute.ref}
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-fp-text-dim mt-0.5">
                    {check.fromDate} → {check.toDate} · {check.elapsedDays} days elapsed
                    {check.requiredDays > 0 && ` · required: ${check.requiredDays}`}
                  </div>
                </div>
                <div className={`text-xs font-medium ${statusColor}`}>
                  {isViolation ? "DEVIATION" : isCompliant ? "COMPLIANT" : "—"}
                </div>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-fp-text-dim" /> : <ChevronRight className="w-3.5 h-3.5 text-fp-text-dim" />}
              </div>

              {isExpanded && (
                <div className="px-4 pb-3 pt-1 space-y-2 animate-[fade-in_0.2s_ease-out]">
                  {check.statute && (
                    <div className="text-xs space-y-1">
                      <div className="font-medium text-fp-text">{check.statute.title}</div>
                      <div className="text-fp-text-muted">{check.statute.description}</div>
                      <div className="text-fp-text-dim font-mono text-[10px]">
                        {check.statute.deadline_value} {check.statute.deadline_type} · {check.statute.deadline_direction} · {check.statute.source}
                      </div>
                    </div>
                  )}
                  <div className={`text-xs p-2 rounded ${statusColor} bg-current/5`}>
                    {check.note}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Related AI Findings */}
      {findings.length > 0 && (
        <div className="pt-3 border-t border-fp-border/40">
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mb-2">
            Related Due-Process Findings
          </div>
          <div className="space-y-1.5">
            {findings.slice(0, 3).map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-xs">
                <AlertTriangle className={`w-3 h-3 shrink-0 ${f.severity === "critical" ? "text-fp-red" : "text-fp-amber"}`} />
                <span className="text-fp-text-muted">{f.rule_name || f.rule.replace(/_/g, " ")}</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${f.severity === "critical" ? "text-fp-red bg-fp-red/10" : "text-fp-amber bg-fp-amber/10"}`}>
                  {f.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
