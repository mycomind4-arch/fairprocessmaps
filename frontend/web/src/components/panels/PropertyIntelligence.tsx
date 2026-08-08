"use client";

import { useEffect, useState, useCallback } from "react";
import {
  MapPin, Loader2, AlertCircle, RefreshCw,
  ShieldAlert, ShieldCheck, ShieldX,
  Plus, ArrowRight, ArrowLeft, AlertTriangle,
  Clock, FileText, Search, Bot,
} from "lucide-react";
import type { ProjectSection } from "@/components/ProjectNav";

interface PropertyData {
  id: string;
  apn: string;
  address: string | null;
  city: string | null;
  county: string | null;
  zoning: string | null;
  acres: number | null;
  legal_desc: string | null;
  centroid_lng: number | null;
  centroid_lat: number | null;
  geom_geojson: string | null;
  created_at: string;
  updated_at: string;
  projectCount?: number;
  evidenceCount?: number;
  timelineCount?: number;
}

interface IntelligenceData {
  id: string;
  property_id: string;
  apn: string;
  zoning: string | null;
  general_plan: string | null;
  acres: number | null;
  coastal_zone: string | null;
  flood_zone: string | null;
  fire_responsibility: string | null;
  legal_description: string | null;
  raw_data: Record<string, any>;
  fetched_at: string;
}

interface OverviewData {
  projectName: string;
  caseType: string;
  status: string;
  openedAt: string;
  apn: string;
  address: string;
  evidenceCount: number;
  findingsCount: number;
  criticalCount: number;
  timelineCount: number;
  dueProcessScore: number | null;
  recentEvidence: Array<{ id: string; title: string; source: string; status: string; created_at: string }>;
  recentTimeline: Array<{ id: string; event_date: string; event_type: string; description: string | null }>;
}

interface Finding {
  id: string;
  rule: string;
  rule_name: string | null;
  severity: string;
  status: string;
  detail: string | null;
  evidence_id: string | null;
  missing_info?: number | boolean;
  created_at: string;
}

function HazardFlag({ label, present, detail }: { label: string; present: boolean | null; detail?: string | null }) {
  const StatusIcon = present ? ShieldAlert : present === false ? ShieldCheck : ShieldX;
  const color = present ? "text-fp-red border-fp-red/30 bg-fp-red/5" : present === false ? "text-fp-green border-fp-green/20 bg-fp-green/5" : "text-fp-text-dim border-fp-border bg-fp-surface/20";
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${color}`}>
      <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-xs opacity-90 mt-0.5">{present === true ? (detail || "In hazard zone") : present === false ? "Not in hazard zone" : "No data"}</div>
      </div>
    </div>
  );
}

function AgentSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (<div className="surface-flat rounded-xl p-4 space-y-3"><h2 className="text-sm font-semibold text-fp-text">{title}</h2>{children}</div>);
}

function caseTypeLabel(ct: string) {
  const labels: Record<string, string> = { code_enforcement: "Code Enforcement", building: "Building Dept", adu_permit: "ADU Permit", other: "Other" };
  return labels[ct] ?? ct;
}

export default function PropertyIntelligence({
  projectId,
  propertyId,
  onNavigate,
}: {
  projectId: string;
  propertyId: string;
  onNavigate: (s: ProjectSection) => void;
}) {
  const [data, setData] = useState<PropertyData | null>(null);
  const [intel, setIntel] = useState<IntelligenceData | null>(null);
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propRes, intelRes, overviewRes, findingsRes] = await Promise.all([
        fetch(`/api/v1/properties?id=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/intelligence/data?propertyId=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/overview?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/findings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
      ]);

      if (propRes.ok) setData(await propRes.json());
      if (intelRes.ok) setIntel(await intelRes.json());
      else if (intelRes.status === 404) setIntel(null);
      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (findingsRes.ok) setFindings(await findingsRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load property data");
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [fetchData]);

  if (loading) {
    return (<div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2"><Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading property intelligence…</div>);
  }

  if (error || !data) {
    return (
      <div className="surface-flat rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm"><AlertCircle className="w-4 h-4 shrink-0" /><span>{error ?? "No property data available"}</span></div>
        <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2"><RefreshCw className="w-3.5 h-3.5" /> Retry</button>
      </div>
    );
  }

  const recon = intel?.raw_data || {};
  const ownerName = recon.parcel?.OWNER || recon.parcel?.OWNER1 || recon.owner?.owner_name || null;
  const ownerAddress = recon.parcel?.MAIL_ADD || recon.owner?.mailing_address || null;
  const openFindings = findings.filter(f => f.status === "open");
  const criticalFindings = openFindings.filter(f => f.severity === "critical");
  const missingInfoFindings = openFindings.filter(f => f.missing_info);
  const evCount = overview?.evidenceCount ?? data.evidenceCount ?? 0;
  const tlCount = overview?.timelineCount ?? data.timelineCount ?? 0;
  const findingsCount = overview?.findingsCount ?? openFindings.length;

  // ── Needs Attention items ──
  type AttentionItem = { label: string; sub?: string; section: ProjectSection; severity: "critical" | "warning" | "info" };
  const attentionItems: AttentionItem[] = [];
  criticalFindings.forEach(f => attentionItems.push({ label: f.rule_name || f.rule, sub: f.detail || undefined, section: "analysis", severity: "critical" }));
  missingInfoFindings.forEach(f => attentionItems.push({ label: `Missing evidence: ${f.rule_name || f.rule}`, sub: f.detail || undefined, section: "vault", severity: "warning" }));
  if (overview && overview.recentTimeline && overview.recentTimeline.length > 0) {
    const latest = overview.recentTimeline[0];
    attentionItems.push({ label: `New timeline event: ${latest.event_type}`, sub: latest.description || latest.event_date, section: "timeline", severity: "info" });
  }
  if (evCount === 0) attentionItems.push({ label: "No evidence uploaded yet", section: "vault", severity: "warning" });
  if (tlCount === 0) attentionItems.push({ label: "No timeline events recorded", section: "timeline", severity: "info" });

  // ── Investigation Brief ──
  const situation = overview
    ? `${caseTypeLabel(overview.caseType)} case for ${overview.address || data.address || "this property"}. Status: ${overview.status || "Active"}.`
    : `Property investigation for ${data.address || "APN " + data.apn}.`;

  const known: string[] = [];
  if (ownerName) known.push(`Record owner: ${ownerName}`);
  if (intel?.zoning) known.push(`Zoning: ${intel.zoning}`);
  if (data.acres) known.push(`Parcel size: ${data.acres.toFixed(2)} acres`);
  if (intel?.general_plan) known.push(`General plan: ${intel.general_plan}`);
  if (evCount > 0) known.push(`${evCount} evidence documents`);
  if (tlCount > 0) known.push(`${tlCount} timeline events`);

  const uncertain: string[] = [];
  if (!ownerName) uncertain.push("Property owner not yet identified from records");
  if (!intel?.coastal_zone || intel.coastal_zone === "No data") uncertain.push("Coastal zone status unclear");
  if (missingInfoFindings.length > 0) uncertain.push(`${missingInfoFindings.length} findings have missing evidence`);

  const nextAction = criticalFindings.length > 0
    ? `Review ${criticalFindings.length} critical finding${criticalFindings.length > 1 ? "s" : ""} in Analysis`
    : evCount === 0
    ? "Upload evidence documents to begin building the case"
    : tlCount === 0
    ? "Run recon to build the timeline"
    : "Run legal analysis to check for due-process issues";

  const nextActionSection: ProjectSection = criticalFindings.length > 0 ? "analysis" : evCount === 0 ? "vault" : tlCount === 0 ? "timeline" : "analysis";

  return (
    <div className="space-y-4 pb-8 max-w-5xl">
      {/* ── Investigation Brief ── */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fp-text">Property Intelligence</h1>
            <p className="text-xs text-fp-text-dim mt-0.5">
              {intel?.fetched_at && `Last scanned: ${intel.fetched_at.slice(0, 16).replace("T", " ")}`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onNavigate("vault")} className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Upload Evidence
            </button>
            <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2" title="Refresh">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Situation */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium mb-1">Situation</div>
          <p className="text-sm text-fp-text">{situation}</p>
        </div>

        {/* Known / Uncertain */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Known</div>
            {known.length > 0 ? known.map((k, i) => (
              <div key={i} className="text-xs text-fp-text-muted flex items-start gap-1.5">
                <ShieldCheck className="w-3 h-3 text-fp-green shrink-0 mt-0.5" /> {k}
              </div>
            )) : <div className="text-xs text-fp-text-dim">No confirmed facts yet</div>}
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Uncertain</div>
            {uncertain.length > 0 ? uncertain.map((u, i) => (
              <div key={i} className="text-xs text-fp-text-muted flex items-start gap-1.5">
                <AlertCircle className="w-3 h-3 text-fp-amber shrink-0 mt-0.5" /> {u}
              </div>
            )) : <div className="text-xs text-fp-text-dim">No uncertainties identified</div>}
          </div>
        </div>

        {/* Next Best Action */}
        <div className="flex items-center gap-3 pt-3 border-t border-fp-border/50">
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium shrink-0">Next:</div>
          <button onClick={() => onNavigate(nextActionSection)} className="text-sm text-fp-blue hover:underline flex items-center gap-1.5">
            {nextAction} <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Needs Attention ── */}
      {attentionItems.length > 0 && (
        <div className="surface-flat rounded-xl p-4">
          <h2 className="text-sm font-semibold text-fp-text mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-fp-amber" /> Needs Attention
          </h2>
          <div className="space-y-1.5">
            {attentionItems.slice(0, 8).map((item, i) => (
              <button key={i} onClick={() => onNavigate(item.section)} className="w-full text-left p-2.5 rounded-lg bg-fp-surface-2/40 border border-fp-border/60 hover:border-fp-border transition-colors flex items-start gap-3">
                {item.severity === "critical" ? <AlertTriangle className="w-3.5 h-3.5 text-fp-red shrink-0 mt-0.5" /> : item.severity === "warning" ? <AlertCircle className="w-3.5 h-3.5 text-fp-amber shrink-0 mt-0.5" /> : <Clock className="w-3.5 h-3.5 text-fp-blue shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-fp-text">{item.label}</div>
                  {item.sub && <div className="text-xs text-fp-text-muted mt-0.5 truncate">{item.sub}</div>}
                </div>
                <ArrowRight className="w-3 h-3 text-fp-text-dim shrink-0 mt-0.5" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Property Identity ── */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">ASSESSOR'S PARCEL NUMBER (APN)</div>
            <div className="font-mono text-xl font-bold tracking-tight text-fp-text mt-0.5">{data.apn}</div>
          </div>
          <div className="text-sm text-fp-text-muted flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {data.address ? `${data.address}, ${data.city || ""}` : "Unassigned Address"}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap pt-3 border-t border-fp-border/50">
          {overview && (<><div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Case Type</div><div className="text-sm font-semibold text-fp-text mt-0.5">{caseTypeLabel(overview.caseType)}</div></div><div className="w-px h-8 bg-fp-border" /></>)}
          {overview?.openedAt && (<><div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Opened</div><div className="text-sm font-semibold text-fp-text mt-0.5">{overview.openedAt.slice(0, 10)}</div></div><div className="w-px h-8 bg-fp-border" /></>)}
          <div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim">Status</div><div className="mt-0.5 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-fp-blue/15 text-fp-blue border border-fp-blue/30 capitalize">{overview?.status || "Active"}</div></div>
        </div>
      </div>

      {/* ── Activity Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Enforcement Cases", value: data.projectCount ?? 0, sub: "projects" },
          { label: "Evidence", value: evCount, sub: "documents" },
          { label: "Timeline", value: tlCount, sub: "events" },
          { label: "Parcel Size", value: data.acres ? `${data.acres.toFixed(2)} ac` : "—", sub: "acreage" },
        ].map((s) => (
          <div key={s.label} className="surface-flat rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">{s.label}</div>
            <div className="text-lg font-semibold text-fp-text mt-1">{s.value}</div>
            <div className="text-[10px] text-fp-text-dim mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Owner & Ownership ── */}
      <AgentSection title="Owner & Ownership Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2 p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
            <div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Record Owner</div><div className="text-sm font-semibold text-fp-text mt-0.5">{ownerName || "No owner record on file"}</div></div>
            <div><div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Mailing Address</div><div className="text-sm text-fp-text-muted mt-0.5">{ownerAddress || "—"}</div></div>
          </div>
          <div className="space-y-2 p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-1.5"><span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Last Transfer</span><span className="font-mono text-fp-text text-sm">{recon.parcel?.TRANDATE ? new Date(recon.parcel.TRANDATE).toLocaleDateString() : "—"}</span></div>
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-1.5"><span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Zoning</span><span className="text-fp-text text-sm font-medium">{intel?.zoning || data.zoning || "—"}</span></div>
            <div className="flex justify-between items-center text-sm"><span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">General Plan</span><span className="text-fp-text text-sm">{intel?.general_plan || "—"}</span></div>
          </div>
        </div>
      </AgentSection>

      {/* ── Hazard & Zone Designations ── */}
      <AgentSection title="Hazard & Zone Designations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HazardFlag label="Coastal Zone" present={intel?.coastal_zone === "Yes" || (intel?.coastal_zone && intel.coastal_zone !== "No" && intel.coastal_zone !== null) ? true : intel?.coastal_zone === "No" ? false : null} detail={intel?.coastal_zone} />
          <HazardFlag label="Flood Zone" present={intel?.flood_zone && intel.flood_zone !== "No" && intel.flood_zone !== "None" ? true : intel?.flood_zone === "No" || intel?.flood_zone === "None" ? false : null} detail={intel?.flood_zone} />
          <HazardFlag label="Fire Responsibility" present={intel?.fire_responsibility && intel.fire_responsibility !== "No" ? true : false} detail={intel?.fire_responsibility} />
          <HazardFlag label="Legal Description" present={data.legal_desc ? true : null} detail={data.legal_desc} />
        </div>
      </AgentSection>

      {/* ── Recent Activity ── */}
      {(overview?.recentTimeline && overview.recentTimeline.length > 0) && (
        <AgentSection title="Recent Activity">
          <div className="space-y-1.5">
            {overview.recentTimeline.slice(0, 5).map((event) => (
              <div key={event.id} className="flex items-center gap-3 text-xs py-1.5 border-b border-fp-border/30 last:border-0">
                <Clock className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
                <span className="font-mono text-fp-text-dim">{event.event_date}</span>
                <span className="text-fp-text-muted">{event.event_type}</span>
                {event.description && <span className="text-fp-text-dim truncate">{event.description}</span>}
              </div>
            ))}
          </div>
          <button onClick={() => onNavigate("timeline")} className="text-xs font-medium text-fp-blue hover:underline flex items-center gap-1 mt-2">
            View full timeline <ArrowRight className="w-3 h-3" />
          </button>
        </AgentSection>
      )}
    </div>
  );
}
