"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";

interface DueProcessBadgeProps {
  propertyId: string | null;
}

export default function DueProcessBadge({ propertyId }: DueProcessBadgeProps) {
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (!propertyId) {
      setReport(null);
      return;
    }
    fetch(`/api/v1/due-process/property/${propertyId}`)
      .then((r) => r.json())
      .then(setReport)
      .catch(() => {});
  }, [propertyId]);

  if (!propertyId || !report) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-fp-gray-400">
        <Shield className="w-4 h-4" />
        <span>No property selected</span>
      </div>
    );
  }

  const critical = report.flags?.filter((f: any) => f.severity === "critical").length || 0;
  const warning = report.flags?.filter((f: any) => f.severity === "warning").length || 0;

  let Icon = ShieldCheck;
  let colorClass = "text-fp-green";
  let bgClass = "bg-green-50";

  if (critical > 0) {
    Icon = ShieldAlert;
    colorClass = "text-fp-red";
    bgClass = "bg-red-50";
  } else if (warning > 0) {
    Icon = ShieldAlert;
    colorClass = "text-fp-amber";
    bgClass = "bg-amber-50";
  }

  return (
    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${bgClass} ${colorClass}`}>
      <Icon className="w-4 h-4" />
      <span className="font-medium">
        Score: {report.overall_score}
        {critical > 0 && ` · ${critical} critical`}
        {warning > 0 && ` · ${warning} warning`}
      </span>
    </div>
  );
}
