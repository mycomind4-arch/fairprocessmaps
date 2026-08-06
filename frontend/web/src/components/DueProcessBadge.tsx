"use client";

import { useEffect, useState } from "react";
import { Shield, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { api } from "@/lib/api";
import type { DueProcessReport } from "@/lib/types";

interface DueProcessBadgeProps {
  propertyId: string | null;
}

export default function DueProcessBadge({ propertyId }: DueProcessBadgeProps) {
  const [report, setReport] = useState<DueProcessReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!propertyId) { setReport(null); return; }
    setLoading(true);
    api.dueProcess.analyze(propertyId).then(setReport).catch(() => setReport(null)).finally(() => setLoading(false));
  }, [propertyId]);

  if (!propertyId || loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-fp-text-dim">
        <Shield className="w-4 h-4" />
        <span>{loading ? "Analyzing..." : "No property selected"}</span>
      </div>
    );
  }
  if (!report) return null;

  const critical = report.flags?.filter((f) => f.severity === "critical").length || 0;
  const warning = report.flags?.filter((f) => f.severity === "warning").length || 0;

  let Icon = ShieldCheck, colorClass = "text-fp-green", bgClass = "bg-fp-green/10 border-fp-green/20";
  if (critical > 0) { Icon = ShieldX; colorClass = "text-fp-red"; bgClass = "bg-fp-red/10 border-fp-red/20"; }
  else if (warning > 0) { Icon = ShieldAlert; colorClass = "text-fp-amber"; bgClass = "bg-fp-amber/10 border-fp-amber/20"; }

  return (
    <div className={`flex items-center gap-2 text-sm px-4 py-2 rounded-full border ${bgClass} ${colorClass} transition-all duration-200 hover:-translate-y-0.5`}>
      <Icon className="w-4 h-4" />
      <span className="font-medium tabular-nums">
        {report.overall_score}
        {critical > 0 && <span className="text-fp-red ml-1">· {critical} critical</span>}
        {warning > 0 && <span className="text-fp-amber ml-1">· {warning} warn</span>}
        {critical === 0 && warning === 0 && <span className="ml-1">· clear</span>}
      </span>
    </div>
  );
}
