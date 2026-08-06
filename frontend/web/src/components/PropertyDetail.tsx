"use client";

import { useEffect, useState } from "react";
import {
  MapPin, AlertTriangle, ChevronRight, Upload, FileText, Calendar
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
      <div className="p-6 space-y-4">
        <div className="shimmer h-8 rounded-[14px] w-3/4" />
        <div className="shimmer h-4 rounded w-1/2" />
        <div className="shimmer h-32 rounded-[14px]" />
      </div>
    );
  }

  if (!property) {
    return <div className="p-6 text-sm text-fp-text-dim">Property record not found.</div>;
  }

  const criticalCount = report?.flags.filter((f) => f.severity === "critical").length ?? 0;
  const warningCount = report?.flags.filter((f) => f.severity === "warning").length ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Address header */}
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-3">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-[14px] bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-fp-blue" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">{property.address}</h1>
            <p className="text-sm text-fp-text-muted mt-0.5">{property.city}, {property.state} {property.zip_code}</p>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim mt-2 font-mono">
              PARCEL APN: {property.parcel_id}
            </div>
          </div>
        </div>
      </div>

      {/* Due-process score card */}
      {report && (
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 flex items-center gap-6">
          <ScoreRing score={report.overall_score} size="md" label="Score" />
          <div className="flex-1 space-y-2">
            <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Due-Process Analysis</div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-fp-red font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {criticalCount} critical flag{criticalCount !== 1 ? "s" : ""}
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-fp-amber font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {warningCount} warning{warningCount !== 1 ? "s" : ""}
              </div>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <div className="flex items-center gap-2 text-xs text-fp-green font-medium">
                <span className="w-2 h-2 rounded-full bg-fp-green" />
                No procedural flags detected
              </div>
            )}
            {report.summary && <p className="text-sm text-fp-text-muted mt-1 leading-relaxed">{report.summary}</p>}
          </div>
        </div>
      )}

      {/* Grouped Owner & Property Specifications */}
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
        <h2 className="text-base font-semibold text-fp-text">Property Specifications</h2>

        {property.owner_name && (
          <div className="p-4 rounded-[14px] bg-fp-surface-2/60 border border-fp-border/60">
            <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Owner of Record</div>
            <div className="text-sm font-semibold text-fp-text mt-1">{property.owner_name}</div>
          </div>
        )}

        <div className="space-y-3 pt-2">
          {property.property_type && (
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40 text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Property Type</span>
              <span className="text-fp-text capitalize">{property.property_type}</span>
            </div>
          )}
          {property.assessed_value != null && (
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40 text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Assessed Value</span>
              <span className="font-mono text-fp-text">${property.assessed_value.toLocaleString()}</span>
            </div>
          )}
          {property.lot_size_sqft != null && (
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40 text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Lot Size</span>
              <span className="font-mono text-fp-text">{property.lot_size_sqft.toLocaleString()} sq ft</span>
            </div>
          )}
          {property.year_built != null && (
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40 text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Year Built</span>
              <span className="font-mono text-fp-text">{property.year_built}</span>
            </div>
          )}
          {property.zoning && (
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40 text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Zoning</span>
              <span className="text-fp-text font-medium">{property.zoning}</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick stats buttons */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onShowPanel("evidence")}
          className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-[14px] bg-fp-blue/15 border border-fp-blue/30 flex items-center justify-center">
              <FileText className="w-5 h-5 text-fp-blue" />
            </div>
            <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-text transition-colors" />
          </div>
          <div className="text-2xl font-semibold text-fp-text mt-3">{evidenceCount}</div>
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mt-0.5">Evidence Vault</div>
        </button>

        <button
          onClick={() => onShowPanel("timeline")}
          className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 text-left group"
        >
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-[14px] bg-fp-amber/15 border border-fp-amber/30 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-fp-amber" />
            </div>
            <ChevronRight className="w-4 h-4 text-fp-text-dim group-hover:text-fp-text transition-colors" />
          </div>
          <div className="text-2xl font-semibold text-fp-text mt-3">{timelineCount}</div>
          <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium mt-0.5">Timeline Events</div>
        </button>
      </div>

      {/* Upload shortcut button */}
      <button
        onClick={() => onShowPanel("upload")}
        className="w-full glass hover:-translate-y-0.5 hover:shadow-lg transition-all duration-200 rounded-[14px] p-4 text-sm font-medium text-fp-blue hover:text-white border border-fp-blue/30 bg-fp-blue/10 flex items-center justify-center gap-2"
      >
        <Upload className="w-4 h-4" />
        Upload New Evidence Document
      </button>

      {/* Due-process flags */}
      {report && report.flags.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold text-fp-text">Due-Process Flags</h2>
          {report.flags.map((flag, idx) => (
            <div
              key={idx}
              className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-2"
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-[14px] flex items-center justify-center shrink-0 ${
                  flag.severity === "critical" ? "bg-fp-red/15 border border-fp-red/30 text-fp-red" : "bg-fp-amber/15 border border-fp-amber/30 text-fp-amber"
                }`}>
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-fp-text">{flag.rule_name}</div>
                  <div className="text-sm text-fp-text-muted mt-1 leading-relaxed">{flag.description}</div>
                  {flag.suggested_action && (
                    <div className="text-xs text-fp-blue mt-2 flex items-start gap-1 font-medium">
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
    </div>
  );
}
