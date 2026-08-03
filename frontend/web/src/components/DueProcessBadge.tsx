"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { DueProcessReport } from "@/lib/types";

interface DueProcessBadgeProps {
  propertyId: string | null;
}

export default function DueProcessBadge({ propertyId }: DueProcessBadgeProps) {
  const [report, setReport] = useState<DueProcessReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) {
      setReport(null);
      return;
    }
    setLoading(true);
    api.dueProcess
      .analyze(propertyId)
      .then(setReport)
      .catch(() => setReport(null))
      .finally(() => setLoading(false));
  }, [propertyId]);

  if (!propertyId || loading) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-fp-gray-400">
        <Shield className="w-4 h-4" />
        <span>{loading ? "Analyzing..." : "No property selected"}</span>
      </div>
    );
  }

  if (!report) return null;

  const critical = report.flags?.filter((f) => f.severity === "critical").length || 0;
  const warning = report.flags?.filter((f) => f.severity === "warning").length || 0;

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
