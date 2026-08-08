"use client";

import { usePanelData, PanelLoading, PanelError } from "./PanelDataWrapper";

export function EventReconstructionPanel({ projectId }: { projectId: string }) {
  const { items, findings, loading, error, fetchData } = usePanelData(projectId);
  if (loading) return <PanelLoading label="Loading event reconstruction…" />;
  if (error) return <PanelError error={error} onRetry={fetchData} />;
  return <EventReconstruction items={items} findings={findings} />;
}

import { useMemo, useState } from "react";
import {
  Bot, AlertTriangle, CheckCircle2, ChevronRight, ChevronDown,
  GitBranch, Search, Link2, HelpCircle, ArrowRight,
  ShieldAlert, Sparkles,
} from "lucide-react";

interface TimelineItem {
  id: string;
  event_date: string;
  event_type: string;
  description: string | null;
  evidence_id: string | null;
  evidence_title: string | null;
  actor_type: string | null;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  detail: string | null;
}

// Define the expected procedural sequence and what should follow what
const PROCEDURAL_CHAIN: { type: string; label: string; expectsNext?: string[]; expectsNextLabel?: string }[] = [
  { type: "project_created", label: "Case Opened", expectsNext: ["inspection", "notice_sent"], expectsNextLabel: "inspection or notice" },
  { type: "intelligence_gathered", label: "Intelligence", expectsNext: ["inspection", "notice_sent"], expectsNextLabel: "inspection or notice" },
  { type: "inspection", label: "Inspection", expectsNext: ["notice_sent", "abatement"], expectsNextLabel: "notice or abatement" },
  { type: "notice_sent", label: "Notice Issued", expectsNext: ["hearing_held", "deadline", "abatement", "decision"], expectsNextLabel: "hearing, deadline, or decision" },
  { type: "hearing_held", label: "Hearing", expectsNext: ["decision", "appeal_filed", "fine_imposed"], expectsNextLabel: "decision, appeal, or fine" },
  { type: "appeal_filed", label: "Appeal Filed", expectsNext: ["decision", "hearing_held"], expectsNextLabel: "decision or hearing" },
  { type: "deadline", label: "Deadline", expectsNext: ["hearing_held", "decision", "fine_imposed"], expectsNextLabel: "hearing, decision, or fine" },
  { type: "decision", label: "Decision", expectsNext: ["fine_imposed", "lien_filed", "abatement", "evidence_uploaded"], expectsNextLabel: "enforcement or recording" },
  { type: "fine_imposed", label: "Fine Imposed", expectsNext: ["lien_filed", "appeal_filed"], expectsNextLabel: "lien or appeal" },
  { type: "abatement", label: "Abatement", expectsNext: ["lien_filed", "decision"], expectsNextLabel: "lien or decision" },
];

interface InferredConnection {
  fromId: string;
  toId: string;
  fromType: string;
  toType: string;
  fromLabel: string;
  toLabel: string;
  fromDate: string;
  toDate: string;
  confidence: number;
  relationship: string;
  evidence: string;
}

interface MissingEvent {
  afterType: string;
  afterLabel: string;
  afterDate: string;
  expectedType: string;
  expectedLabel: string;
  confidence: number;
  description: string;
}

export default function EventReconstruction({
  items,
  findings,
}: {
  items: TimelineItem[];
  findings: Finding[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Sort items chronologically
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => a.event_date.localeCompare(b.event_date));
  }, [items]);

  // Infer connections between events
  const connections = useMemo<InferredConnection[]>(() => {
    const conns: InferredConnection[] = [];

    for (let i = 0; i < sortedItems.length - 1; i++) {
      const current = sortedItems[i];
      const next = sortedItems[i + 1];

      // Find what this event type expects next
      const chainEntry = PROCEDURAL_CHAIN.find((c) => c.type === current.event_type);

      if (chainEntry?.expectsNext?.includes(next.event_type)) {
        // This is an expected procedural connection
        const daysBetween = Math.round(
          (new Date(next.event_date).getTime() - new Date(current.event_date).getTime()) / 86400000
        );
        const hasEvidence = !!(current.evidence_id || next.evidence_id);
        const confidence = hasEvidence ? 95 : 80;

        conns.push({
          fromId: current.id,
          toId: next.id,
          fromType: current.event_type,
          toType: next.event_type,
          fromLabel: chainEntry.label,
          toLabel: PROCEDURAL_CHAIN.find((c) => c.type === next.event_type)?.label || next.event_type,
          fromDate: current.event_date,
          toDate: next.event_date,
          confidence,
          relationship: `procedural_sequence`,
          evidence: hasEvidence
            ? "Supported by linked evidence records"
            : "Inferred from event type sequence and date proximity",
        });
      } else if (current.event_type === next.event_type) {
        // Same type repeated — likely continuation
        conns.push({
          fromId: current.id,
          toId: next.id,
          fromType: current.event_type,
          toType: next.event_type,
          fromLabel: current.event_type.replace(/_/g, " "),
          toLabel: next.event_type.replace(/_/g, " "),
          fromDate: current.event_date,
          toDate: next.event_date,
          confidence: 70,
          relationship: "continuation",
          evidence: "Same event type repeated — likely a follow-up or continuation",
        });
      } else {
        // Still a temporal connection but not procedurally expected
        const daysBetween = Math.round(
          (new Date(next.event_date).getTime() - new Date(current.event_date).getTime()) / 86400000
        );
        if (daysBetween <= 365) {
          conns.push({
            fromId: current.id,
            toId: next.id,
            fromType: current.event_type,
            toType: next.event_type,
            fromLabel: current.event_type.replace(/_/g, " "),
            toLabel: next.event_type.replace(/_/g, " "),
            fromDate: current.event_date,
            toDate: next.event_date,
            confidence: 50,
            relationship: "temporal",
            evidence: `Events occurred ${daysBetween} days apart — connection inferred from temporal proximity`,
          });
        }
      }
    }

    return conns;
  }, [sortedItems]);

  // Detect missing events in the procedural sequence
  const missingEvents = useMemo<MissingEvent[]>(() => {
    const missing: MissingEvent[] = [];
    const eventTypes = new Set(sortedItems.map((i) => i.event_type));

    for (const item of sortedItems) {
      const chainEntry = PROCEDURAL_CHAIN.find((c) => c.type === item.event_type);
      if (!chainEntry?.expectsNext) continue;

      // Check if any of the expected next events exist after this one
      const hasExpectedNext = sortedItems.some(
        (other) =>
          other.event_date > item.event_date &&
          chainEntry.expectsNext!.includes(other.event_type)
      );

      if (!hasExpectedNext) {
        // This event has no expected follow-up — potential gap
        const isLastOfType = !sortedItems.some(
          (other) =>
            other.id !== item.id &&
            other.event_date > item.event_date &&
            other.event_type === item.event_type
        );

        if (isLastOfType) {
          // Check if there are events after this one that aren't the expected type
          const hasAnyAfter = sortedItems.some((other) => other.event_date > item.event_date);
          const expectedLabels = chainEntry.expectsNext.map((t) =>
            PROCEDURAL_CHAIN.find((c) => c.type === t)?.label || t.replace(/_/g, " ")
          ).join(" or ");

          missing.push({
            afterType: item.event_type,
            afterLabel: chainEntry.label,
            afterDate: item.event_date,
            expectedType: chainEntry.expectsNext[0],
            expectedLabel: expectedLabels,
            confidence: 78,
            description: `After ${chainEntry.label} on ${item.event_date}, no ${expectedLabels} was recorded. The procedural sequence may be incomplete.`,
          });
        }
      }
    }

    // Remove duplicates (same afterType + afterDate)
    const seen = new Set<string>();
    return missing.filter((m) => {
      const key = `${m.afterType}-${m.afterDate}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [sortedItems]);

  if (items.length === 0) return null;

  const stats = {
    totalConnections: connections.length,
    verifiedConnections: connections.filter((c) => c.confidence >= 90).length,
    inferredConnections: connections.filter((c) => c.confidence >= 70 && c.confidence < 90).length,
    temporalConnections: connections.filter((c) => c.confidence < 70).length,
    missingEvents: missingEvents.length,
  };

  return (
    <div className="glass rounded-xl p-4 border-fp-border shadow-lg shadow-black/20 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-fp-blue" />
          <h3 className="text-sm font-semibold text-fp-text">AI Event Reconstruction</h3>
          <span className="text-xs text-fp-text-dim">— inferred relationships & gaps</span>
        </div>
        <div className="flex items-center gap-1.5">
          {stats.verifiedConnections > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-fp-green/15 text-fp-green border border-fp-green/30 font-medium">
              {stats.verifiedConnections} verified
            </span>
          )}
          {stats.inferredConnections > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-fp-blue/15 text-fp-blue border border-fp-blue/30 font-medium">
              {stats.inferredConnections} inferred
            </span>
          )}
          {stats.missingEvents > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-fp-amber/15 text-fp-amber border border-fp-amber/30 font-medium">
              {stats.missingEvents} gaps
            </span>
          )}
        </div>
      </div>

      {/* Missing Events — highest priority */}
      {missingEvents.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-fp-amber" />
            Potential Missing Events
          </div>
          {missingEvents.map((missing, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg bg-fp-amber/5 border border-fp-amber/20"
            >
              <HelpCircle className="w-4 h-4 shrink-0 text-fp-amber mt-0.5" />
              <div className="flex-1">
                <div className="text-xs font-medium text-fp-text">
                  Missing: {missing.expectedLabel}
                </div>
                <p className="text-xs text-fp-text-muted mt-1 leading-relaxed">
                  {missing.description}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {/* Confidence bar */}
                  <div className="w-20 h-1.5 rounded-full bg-fp-surface-2 overflow-hidden">
                    <div className="h-full rounded-full bg-fp-amber" style={{ width: `${missing.confidence}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-fp-amber">{missing.confidence}% confidence</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inferred Connections */}
      {connections.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-fp-blue" />
            Event Connections ({connections.length})
          </div>
          {connections.map((conn, idx) => {
            const isVerified = conn.confidence >= 90;
            const isInferred = conn.confidence >= 70 && conn.confidence < 90;
            const isTemporal = conn.confidence < 70;
            const isExpanded = expanded === `conn-${idx}`;

            const dotColor = isVerified ? "bg-fp-green" : isInferred ? "bg-fp-blue" : "bg-fp-text-dim";
            const lineStyle = isVerified ? "solid" : "dashed";
            const lineClass = isVerified ? "border-fp-green/40" : isInferred ? "border-fp-blue/40" : "border-fp-border/40";

            return (
              <div key={idx} className={`rounded-lg border ${lineClass} overflow-hidden`}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : `conn-${idx}`)}
                  className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-fp-surface-2/40 transition-colors"
                >
                  {/* Visual connection: dot — line — dot */}
                  <div className="flex items-center gap-1 shrink-0">
                    <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                    <div
                      className={`w-8 border-t-2 ${lineClass.replace("border-", "border-t-")}`}
                      style={{ borderStyle: lineStyle }}
                    />
                    <ArrowRight className={`w-3 h-3 ${isVerified ? "text-fp-green" : isInferred ? "text-fp-blue" : "text-fp-text-dim"}`} />
                    <div
                      className={`w-8 border-t-2 ${lineClass.replace("border-", "border-t-")}`}
                      style={{ borderStyle: lineStyle }}
                    />
                    <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="font-medium text-fp-text capitalize">{conn.fromLabel}</span>
                      <ArrowRight className="w-3 h-3 text-fp-text-dim" />
                      <span className="font-medium text-fp-text capitalize">{conn.toLabel}</span>
                    </div>
                    <div className="text-[10px] text-fp-text-dim mt-0.5">
                      {conn.fromDate} → {conn.toDate}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-12 h-1 rounded-full bg-fp-surface-2 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${dotColor}`}
                        style={{ width: `${conn.confidence}%` }}
                      />
                    </div>
                    <span className={`text-[10px] font-mono ${isVerified ? "text-fp-green" : isInferred ? "text-fp-blue" : "text-fp-text-dim"}`}>
                      {conn.confidence}%
                    </span>
                    {isExpanded ? <ChevronDown className="w-3 h-3 text-fp-text-dim" /> : <ChevronRight className="w-3 h-3 text-fp-text-dim" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-4 pb-3 space-y-2 animate-[fade-in_0.2s_ease-out]">
                    <div className="text-xs text-fp-text-muted leading-relaxed">{conn.evidence}</div>
                    <div className="flex items-center gap-3 text-[10px] text-fp-text-dim">
                      <span>Type: <span className="font-mono text-fp-text-muted">{conn.relationship}</span></span>
                      <span>•</span>
                      <span className={isVerified ? "text-fp-green" : isInferred ? "text-fp-blue" : "text-fp-text-dim"}>
                        {isVerified ? "Verified by evidence" : isInferred ? "AI-inferred from sequence" : "Temporal proximity only"}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI Insight Footer */}
      <div className="pt-3 border-t border-fp-border/40 flex items-start gap-2">
        <Sparkles className="w-3.5 h-3.5 text-fp-blue shrink-0 mt-0.5" />
        <p className="text-xs text-fp-text-dim leading-relaxed">
          AI reconstructs the procedural sequence by analyzing event types, date proximity, and evidence links.
          Verified connections (green) have supporting evidence. Inferred connections (blue) are based on
          procedural sequence patterns. Temporal connections (gray) are based on date proximity only.
        </p>
      </div>
    </div>
  );
}
