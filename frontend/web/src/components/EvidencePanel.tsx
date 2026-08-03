"use client";

import { useEffect, useState } from "react";
import { FileText, AlertTriangle, CheckCircle, Clock, Loader2, Inbox } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { Evidence } from "@/lib/types";

interface EvidencePanelProps {
  propertyId: string | null;
  refreshKey?: number;
}

export default function EvidencePanel({ propertyId, refreshKey }: EvidencePanelProps) {
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!propertyId) {
      setEvidence([]);
      return;
    }
    setLoading(true);
    setError(null);
    api.evidence
      .list({ property_id: propertyId, limit: 50 })
      .then((data) => {
        setEvidence(data);
      })
      .catch((e: ApiError) => {
        setError(e.detail || "Failed to load evidence");
      })
      .finally(() => setLoading(false));
  }, [propertyId, refreshKey]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "analyzed":
        return <CheckCircle className="w-4 h-4 text-fp-green" />;
      case "flagged":
        return <AlertTriangle className="w-4 h-4 text-fp-red" />;
      case "raw":
      case "ocr_pending":
      case "extraction_pending":
        return <Clock className="w-4 h-4 text-fp-gray-400" />;
      default:
        return <FileText className="w-4 h-4 text-fp-gray-500" />;
    }
  };

  const statusLabel = (status: string) =>
    status.replace(/_/g, " ");

  if (!propertyId) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="text-center text-fp-gray-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Select a property to view evidence</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-5 h-5 text-fp-gray-400 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-fp-red flex items-center gap-2">
        <AlertTriangle className="w-4 h-4" />
        {error}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-fp-gray-700 uppercase tracking-wide">
          Evidence
        </h2>
        <span className="text-xs text-fp-gray-400">{evidence.length} item{evidence.length !== 1 ? "s" : ""}</span>
      </div>

      {evidence.length === 0 ? (
        <div className="text-center py-8 text-fp-gray-400">
          <Inbox className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No evidence uploaded yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {evidence.map((ev) => (
            <div
              key={ev.id}
              className="bg-white rounded-lg border border-fp-gray-200 p-3 hover:border-fp-gray-300 transition-colors cursor-pointer"
            >
              <div className="flex items-start gap-2">
                {statusIcon(ev.status)}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{ev.title}</div>
                  <div className="text-xs text-fp-gray-400 mt-0.5">
                    {ev.evidence_type.replace(/_/g, " ")} · {statusLabel(ev.status)}
                  </div>
                  {ev.source_portal && (
                    <div className="text-[10px] text-fp-gray-400 mt-0.5">
                      Source: {ev.source_portal}
                    </div>
                  )}
                  {ev.due_process_flags && ev.due_process_flags.length > 0 && (
                    <div className="mt-1.5 flex gap-1 flex-wrap">
                      {ev.due_process_flags.map((f, i) => (
                        <span
                          key={i}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                            f.severity === "critical"
                              ? "bg-red-50 text-fp-red"
                              : f.severity === "warning"
                              ? "bg-amber-50 text-fp-amber"
                              : "bg-fp-gray-50 text-fp-gray-500"
                          }`}
                        >
                          {f.rule_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
