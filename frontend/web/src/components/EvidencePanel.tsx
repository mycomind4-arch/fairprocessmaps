"use client";

import { useEffect, useState } from "react";
import { FileText, AlertTriangle, CheckCircle, Clock } from "lucide-react";

interface EvidencePanelProps {
  propertyId: string | null;
}

export default function EvidencePanel({ propertyId }: EvidencePanelProps) {
  const [evidence, setEvidence] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) {
      setEvidence([]);
      return;
    }
    setLoading(true);
    fetch(`/api/v1/evidence?property_id=${propertyId}&limit=50`)
      .then((r) => r.json())
      .then(setEvidence)
      .finally(() => setLoading(false));
  }, [propertyId]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "analyzed": return <CheckCircle className="w-4 h-4 text-fp-green" />;
      case "flagged": return <AlertTriangle className="w-4 h-4 text-fp-red" />;
      case "raw": return <Clock className="w-4 h-4 text-fp-gray-400" />;
      default: return <FileText className="w-4 h-4 text-fp-gray-500" />;
    }
  };

  if (!propertyId) {
    return (
      <div className="p-4 text-sm text-fp-gray-400">
        Select a property on the map to view evidence.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="text-sm font-semibold text-fp-gray-700 mb-3 uppercase tracking-wide">
        Evidence
      </h2>
      {loading && <div className="text-sm text-fp-gray-400">Loading...</div>}
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
                  {ev.evidence_type.replace(/_/g, " ")} · {ev.status}
                </div>
                {ev.due_process_flags?.length > 0 && (
                  <div className="mt-1.5 flex gap-1 flex-wrap">
                    {ev.due_process_flags.map((f: any, i: number) => (
                      <span
                        key={i}
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          f.severity === "critical"
                            ? "bg-red-50 text-red-600"
                            : f.severity === "warning"
                            ? "bg-amber-50 text-amber-600"
                            : "bg-gray-50 text-gray-500"
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
    </div>
  );
}
