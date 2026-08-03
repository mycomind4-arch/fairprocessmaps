"use client";

import { useEffect, useState } from "react";
import { FileText, AlertTriangle, CheckCircle, Clock, Loader2, Inbox } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Evidence } from "@/lib/types";

interface EvidencePanelProps {
  propertyId: string | null;
  refreshKey?: number;
}

const TYPE_COLORS: Record<string, string> = {
  code_enforcement_notice: "text-fp-red border-fp-red/30",
  hearing_notice: "text-fp-amber border-fp-amber/30",
  court_filing: "text-fp-purple border-fp-purple/30",
  appeal_document: "text-fp-cyan border-fp-cyan/30",
  inspector_report: "text-fp-teal border-fp-teal/30",
  permit_application: "text-fp-blue border-fp-blue/30",
  correspondence: "text-fp-text-muted border-fp-border",
  public_record: "text-fp-green border-fp-green/30",
  photograph: "text-fp-text-muted border-fp-border",
  other: "text-fp-text-dim border-fp-border",
};

export default function EvidencePanel({ propertyId, refreshKey }: EvidencePanelProps) {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) { setEvidence([]); return; }
    setLoading(true);
    setError(null);
    api.evidence
      .list({ property_id: propertyId, limit: 50 })
      .then(setEvidence)
      .catch((e: ApiError) => setError(e.detail || "Failed to load evidence"))
      .finally(() => setLoading(false));
  }, [propertyId, refreshKey]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "analyzed": return <CheckCircle className="w-4 h-4 text-fp-green" />;
      case "flagged": return <AlertTriangle className="w-4 h-4 text-fp-red" />;
      case "raw":
      case "ocr_pending":
      case "extraction_pending": return <Clock className="w-4 h-4 text-fp-text-dim" />;
      default: return <FileText className="w-4 h-4 text-fp-text-muted" />;
    }
  };

  if (!propertyId) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-7 h-7 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">Select a property to view evidence</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-xl p-3 space-y-2">
            <div className="shimmer h-4 w-2/3 rounded" />
            <div className="shimmer h-3 w-1/2 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-3 text-sm text-fp-red flex items-center gap-2 glass rounded-xl">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2.5 animate-[fade-in_0.3s_ease-out]">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Evidence Records</h2>
        <span className="text-xs text-fp-text-dim tabular-nums">{evidence.length} item{evidence.length !== 1 ? "s" : ""}</span>
      </div>

      {evidence.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-2xl glass flex items-center justify-center mb-3">
            <Inbox className="w-7 h-7 text-fp-text-dim" />
          </div>
          <p className="text-sm text-fp-text-muted">No evidence uploaded yet</p>
        </div>
      ) : (
        evidence.map((ev) => (
          <div key={ev.id} className="glass glass-hover rounded-xl p-3.5 transition-all cursor-pointer group animate-[slide-up_0.3s_ease-out]">
            <div className="flex items-start gap-2.5">
              <div className="shrink-0 mt-0.5">{statusIcon(ev.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-fp-text group-hover:text-white transition-colors truncate">{ev.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TYPE_COLORS[ev.evidence_type] || TYPE_COLORS.other} uppercase font-medium`}>
                    {ev.evidence_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-[10px] text-fp-text-dim">{ev.status.replace(/_/g, " ")}</span>
                </div>
                {ev.source_portal && <div className="text-[10px] text-fp-text-dim mt-1">Source: {ev.source_portal}</div>}
                {ev.due_process_flags && ev.due_process_flags.length > 0 && (
                  <div className="mt-2 flex gap-1.5 flex-wrap">
                    {ev.due_process_flags.map((f, i) => (
                      <span key={i} className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${
                        f.severity === "critical" ? "bg-fp-red/15 text-fp-red border border-fp-red/20"
                        : f.severity === "warning" ? "bg-fp-amber/15 text-fp-amber border border-fp-amber/20"
                        : "bg-fp-surface-2 text-fp-text-muted border border-fp-border"
                      }`}>{f.rule_name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
