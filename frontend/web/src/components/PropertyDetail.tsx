"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Building2, User, DollarSign, Ruler, Calendar,
  FileText, AlertTriangle, ChevronRight, Upload,
} from "lucide-react";
import { api } from "@/lib/api";
import ScoreRing from "@/components/ScoreRing";
import type { Property, DueProcessReport } from "@/lib/types";

interface PropertyDetailProps {
  propertyId: string;
  onShowPanel: (panel: "evidence" | "timeline" | "upload") => void;
}

export default function PropertyDetail({ propertyId, onShowPanel }: PropertyDetailProps) {
  const [property, setProperty] = useState<Property | null>(null);
  const [report, setReport] = useState<DueProcessReport | null>(null);
  const [evidenceCount, setEvidenceCount] = useState(0);
  const [timelineCount, setTimelineCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!propertyId) return;
    setLoading(true);
    Promise.allSettled([
      api.properties.get(propertyId),
      api.dueProcess.analyze(propertyId),
      api.evidence.list({ property_id: propertyId, limit: 1 }),
      api.timeline.get(propertyId),
    ]).then(([propResult, reportResult, evidenceResult, timelineResult]) => {
      if (propResult.status === "fulfilled") setProperty(propResult.value);
      if (reportResult.status === "fulfilled") setReport(reportResult.value);
      if (evidenceResult.status === "fulfilled") setEvidenceCount(evidenceResult.value.length);
      if (timelineResult.status === "fulfilled") setTimelineCount(timelineResult.value.length);
      setLoading(false);
    });
  }, [propertyId]);

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <div className="shimmer h-6 rounded w-3/4" />
        <div className="shimmer h-4 rounded w-1/2" />
        <div className="shimmer h-24 rounded-xl" />
      </div>
    );
  }

  if (!property) {
    return <div className="p-4 text-sm text-fp-text-dim">Property not found.</div>;
  }

  const criticalCount = report?.flags.filter((f) => f.severity === "critical").length ?? 0;
  const warningCount = report?.flags.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <div className="p-4 space-y-4 animate-[fade-in_0.3s_ease-out]">
      {/* Address header */}
      <div>
        <div className="flex items-start gap-2.5">
          <div className="w-9 h-9 rounded-xl glass flex items-center justify-center shrink-0">
            <MapPin className="w-4.5 h-4.5 text-fp-cyan" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fp-text leading-tight">{property.address}</h2>
            <p className="text-sm text-fp-text-muted mt-0.5">{property.city}, {property.state} {property.zip_code}</p>
            <p className="text-xs text-fp-text-dim mt-1 font-mono">Parcel: {property.parcel_id}</p>
          </div>
        </div>
      </div>

      {/* Due-process score card */}
      {report && (
        <div className="glass rounded-2xl p-4 flex items-center gap-4 animate-[scale-in_0.25s_ease-out]">
          <ScoreRing score={report.overall_score} size="md" label="Score" />
          <div className="flex-1 space-y-1.5">
            <div className="text-xs text-fp-text-dim uppercase tracking-wider">Due-Process Analysis</div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-fp-red">
                <AlertTriangle className="w-3.5 h-3.5" />
                {criticalCount} critical flag{criticalCount !== 1 ? "s" : ""}
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-fp-amber">
                <AlertTriangle className="w-3.5 h-3.5" />
                {warningCount} warning{warningCount !== 1 ? "s" : ""}
              </div>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <div className="flex items-center gap-1.5 text-xs text-fp-green">
                <span className="w-1.5 h-1.5 rounded-full bg-fp-green" />
                No discrepancies detected
              </div>
            )}
            {report.summary && <p className="text-xs text-fp-text-muted mt-1">{report.summary}</p>}
          </div>
        </div>
      )}

      {/* Property attributes */}
      <div className="glass rounded-xl p-4 space-y-2.5">
        {property.property_type && (
          <div className="flex items-center gap-2.5 text-sm">
            <Building2 className="w-4 h-4 text-fp-text-dim shrink-0" />
            <span className="text-fp-text-dim">Type</span>
            <span className="text-fp-text ml-auto capitalize">{property.property_type}</span>
          </div>
        )}
        {property.owner_name && (
          <div className="flex items-center gap-2.5 text-sm">
            <User className="w-4 h-4 text-fp-text-dim shrink-0" />
            <span className="text-fp-text-dim">Owner</span>
            <span className="text-fp-text ml-auto truncate">{property.owner_name}</span>
          </div>
        )}
        {property.assessed_value != null && (
          <div className="flex items-center gap-2.5 text-sm">
            <DollarSign className="w-4 h-4 text-fp-text-dim shrink-0" />
            <span className="text-fp-text-dim">Assessed</span>
            <span className="text-fp-text ml-auto tabular-nums">${property.assessed_value.toLocaleString()}</span>
          </div>
        )}
        {property.lot_size_sqft != null && (
          <div className="flex items-center gap-2.5 text-sm">
            <Ruler className="w-4 h-4 text-fp-text-dim shrink-0" />
            <span className="text-fp-text-dim">Lot</span>
            <span className="text-fp-text ml-auto tabular-nums">{property.lot_size_sqft.toLocaleString()} sqft</span>
          </div>
        )}
        {property.year_built != null && (
          <div className="flex items-center gap-2.5 text-sm">
            <Calendar className="w-4 h-4 text-fp-text-dim shrink-0" />
            <span className="text-fp-text-dim">Built</span>
            <span className="text-fp-text ml-auto">{property.year_built}</span>
          </div>
        )}
        {property.zoning && (
          <div className="flex items-center gap-2.5 text-sm">
            <span className="text-fp-text-dim w-4 shrink-0" />
            <span className="text-fp-text-dim">Zoning</span>
            <span className="text-fp-text ml-auto">{property.zoning}</span>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => onShowPanel("evidence")} className="glass glass-hover rounded-xl p-3.5 transition-all text-left group animate-[slide-up_0.3s_ease-out]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-fp-purple/15 flex items-center justify-center">
              <FileText className="w-4.5 h-4.5 text-fp-purple" />
            </div>
            <div>
              <div className="text-lg font-bold text-fp-text tabular-nums">{evidenceCount}</div>
              <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">Evidence</div>
            </div>
            <ChevronRight className="w-4 h-4 text-fp-text-dim ml-auto group-hover:text-fp-text transition-colors" />
          </div>
        </button>
        <button onClick={() => onShowPanel("timeline")} className="glass glass-hover rounded-xl p-3.5 transition-all text-left group animate-[slide-up_0.3s_ease-out]" style={{ animationDelay: "50ms" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-fp-amber/15 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-fp-amber" />
            </div>
            <div>
              <div className="text-lg font-bold text-fp-text tabular-nums">{timelineCount}</div>
              <div className="text-[10px] text-fp-text-dim uppercase tracking-wider">Events</div>
            </div>
            <ChevronRight className="w-4 h-4 text-fp-text-dim ml-auto group-hover:text-fp-text transition-colors" />
          </div>
        </button>
      </div>

      {/* Upload shortcut */}
      <button onClick={() => onShowPanel("upload")} className="w-full flex items-center justify-center gap-2 text-sm text-fp-cyan border border-fp-cyan/20 rounded-xl py-2.5 hover:bg-fp-cyan/10 transition-all glass">
        <Upload className="w-4 h-4" />
        Upload new evidence
      </button>

      {/* Due-process flags */}
      {report && report.flags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Due-Process Flags</h3>
          {report.flags.map((flag, idx) => (
            <div key={idx} className={`rounded-xl border p-3 glass animate-[slide-up_0.3s_ease-out]`} style={{ animationDelay: `${idx * 50}ms` }}>
              <div className="flex items-start gap-2.5">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  flag.severity === "critical" ? "bg-fp-red/15" : flag.severity === "warning" ? "bg-fp-amber/15" : "bg-fp-surface-2"
                }`}>
                  <AlertTriangle className={`w-3.5 h-3.5 ${flag.severity === "critical" ? "text-fp-red" : "text-fp-amber"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-text">{flag.rule_name}</div>
                  <div className="text-xs text-fp-text-muted mt-0.5">{flag.description}</div>
                  {flag.suggested_action && (
                    <div className="text-xs text-fp-cyan mt-1.5 flex items-start gap-1">
                      <span>→</span>
                      <span>{flag.suggested_action}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {report && report.recommendations && report.recommendations.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-fp-text-muted uppercase tracking-wider">Recommendations</h3>
          <div className="glass rounded-xl p-3 space-y-1.5">
            {report.recommendations.map((rec, idx) => (
              <div key={idx} className="text-xs text-fp-text-muted flex items-start gap-2">
                <span className="text-fp-cyan shrink-0">→</span>
                <span>{rec}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
