"use client";

import { useEffect, useState } from "react";
import {
  MapPin,
  Building2,
  User,
  DollarSign,
  Ruler,
  Calendar,
  FileText,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Property, DueProcessReport, Evidence, TimelineEvent } from "@/lib/types";

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
      <div className="p-4 animate-pulse space-y-3">
        <div className="h-6 bg-fp-gray-100 rounded w-3/4" />
        <div className="h-4 bg-fp-gray-100 rounded w-1/2" />
        <div className="h-20 bg-fp-gray-100 rounded" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="p-4 text-sm text-fp-gray-400">
        Property not found.
      </div>
    );
  }

  const criticalCount = report?.flags.filter((f) => f.severity === "critical").length ?? 0;
  const warningCount = report?.flags.filter((f) => f.severity === "warning").length ?? 0;

  const scoreColor =
    !report ? "text-fp-gray-400" :
    report.overall_score >= 80 ? "text-fp-green" :
    report.overall_score >= 50 ? "text-fp-amber" :
    "text-fp-red";

  const scoreBg =
    !report ? "bg-fp-gray-50" :
    report.overall_score >= 80 ? "bg-green-50" :
    report.overall_score >= 50 ? "bg-amber-50" :
    "bg-red-50";

  return (
    <div className="p-4 space-y-4">
      {/* Address header */}
      <div>
        <div className="flex items-start gap-2">
          <MapPin className="w-5 h-5 text-fp-gray-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-semibold text-fp-gray-800 leading-tight">
              {property.address}
            </h2>
            <p className="text-sm text-fp-gray-500 mt-0.5">
              {property.city}, {property.state} {property.zip_code}
            </p>
            <p className="text-xs text-fp-gray-400 mt-1 font-mono">
              Parcel: {property.parcel_id}
            </p>
          </div>
        </div>
      </div>

      {/* Due-process score */}
      {report && (
        <div className={`rounded-lg p-3 ${scoreBg}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-fp-gray-500 uppercase tracking-wide">
                Due-Process Score
              </div>
              <div className={`text-2xl font-bold ${scoreColor}`}>
                {report.overall_score}
                <span className="text-sm font-normal text-fp-gray-400">/100</span>
              </div>
            </div>
            <div className="text-right space-y-1">
              {criticalCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-fp-red">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {criticalCount} critical
                </div>
              )}
              {warningCount > 0 && (
                <div className="flex items-center gap-1 text-xs text-fp-amber">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {warningCount} warning
                </div>
              )}
              {criticalCount === 0 && warningCount === 0 && (
                <div className="text-xs text-fp-green">
                  No discrepancies
                </div>
              )}
            </div>
          </div>
          {report.summary && (
            <p className="text-xs text-fp-gray-500 mt-2">{report.summary}</p>
          )}
        </div>
      )}

      {/* Property attributes */}
      <div className="space-y-2">
        {property.property_type && (
          <div className="flex items-center gap-2 text-sm">
            <Building2 className="w-4 h-4 text-fp-gray-400" />
            <span className="text-fp-gray-500">Type:</span>
            <span className="text-fp-gray-700 capitalize">{property.property_type}</span>
          </div>
        )}
        {property.owner_name && (
          <div className="flex items-center gap-2 text-sm">
            <User className="w-4 h-4 text-fp-gray-400" />
            <span className="text-fp-gray-500">Owner:</span>
            <span className="text-fp-gray-700">{property.owner_name}</span>
          </div>
        )}
        {property.assessed_value != null && (
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="w-4 h-4 text-fp-gray-400" />
            <span className="text-fp-gray-500">Assessed:</span>
            <span className="text-fp-gray-700">
              ${property.assessed_value.toLocaleString()}
            </span>
          </div>
        )}
        {property.lot_size_sqft != null && (
          <div className="flex items-center gap-2 text-sm">
            <Ruler className="w-4 h-4 text-fp-gray-400" />
            <span className="text-fp-gray-500">Lot:</span>
            <span className="text-fp-gray-700">
              {property.lot_size_sqft.toLocaleString()} sqft
            </span>
          </div>
        )}
        {property.year_built != null && (
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="w-4 h-4 text-fp-gray-400" />
            <span className="text-fp-gray-500">Built:</span>
            <span className="text-fp-gray-700">{property.year_built}</span>
          </div>
        )}
        {property.zoning && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-fp-gray-500">Zoning:</span>
            <span className="text-fp-gray-700">{property.zoning}</span>
          </div>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onShowPanel("evidence")}
          className="flex items-center gap-2 bg-fp-gray-50 rounded-lg p-3 hover:bg-fp-gray-100 transition-colors text-left"
        >
          <FileText className="w-5 h-5 text-fp-gray-400" />
          <div>
            <div className="text-lg font-semibold text-fp-gray-700">
              {evidenceCount}
            </div>
            <div className="text-xs text-fp-gray-400">Evidence</div>
          </div>
          <ChevronRight className="w-4 h-4 text-fp-gray-300 ml-auto" />
        </button>
        <button
          onClick={() => onShowPanel("timeline")}
          className="flex items-center gap-2 bg-fp-gray-50 rounded-lg p-3 hover:bg-fp-gray-100 transition-colors text-left"
        >
          <Calendar className="w-5 h-5 text-fp-gray-400" />
          <div>
            <div className="text-lg font-semibold text-fp-gray-700">
              {timelineCount}
            </div>
            <div className="text-xs text-fp-gray-400">Events</div>
          </div>
          <ChevronRight className="w-4 h-4 text-fp-gray-300 ml-auto" />
        </button>
      </div>

      {/* Upload shortcut */}
      <button
        onClick={() => onShowPanel("upload")}
        className="w-full flex items-center justify-center gap-2 text-sm text-fp-blue border border-fp-blue/30 rounded-lg py-2 hover:bg-fp-blue/5 transition-colors"
      >
        <FileText className="w-4 h-4" />
        Upload new evidence
      </button>

      {/* Due-process flags list */}
      {report && report.flags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-fp-gray-500 uppercase tracking-wide">
            Due-Process Flags
          </h3>
          {report.flags.map((flag, idx) => (
            <div
              key={idx}
              className={`rounded-md border p-2 ${
                flag.severity === "critical"
                  ? "border-red-200 bg-red-50"
                  : flag.severity === "warning"
                  ? "border-amber-200 bg-amber-50"
                  : "border-fp-gray-200 bg-fp-gray-50"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`w-4 h-4 shrink-0 mt-0.5 ${
                    flag.severity === "critical" ? "text-fp-red" : "text-fp-amber"
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-gray-700">
                    {flag.rule_name}
                  </div>
                  <div className="text-xs text-fp-gray-500 mt-0.5">
                    {flag.description}
                  </div>
                  {flag.suggested_action && (
                    <div className="text-xs text-fp-gray-400 mt-1 italic">
                      → {flag.suggested_action}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {report && report.recommendations.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-xs font-semibold text-fp-gray-500 uppercase tracking-wide">
            Recommendations
          </h3>
          {report.recommendations.map((rec, idx) => (
            <div key={idx} className="text-xs text-fp-gray-600 flex items-start gap-1.5">
              <span className="text-fp-gray-400">•</span>
              <span>{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
