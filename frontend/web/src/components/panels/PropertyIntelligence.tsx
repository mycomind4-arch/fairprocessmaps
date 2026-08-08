"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  MapPin, Loader2, AlertCircle, RefreshCw,
  ShieldAlert, ShieldCheck, ShieldX,
  Plus, ArrowRight, AlertTriangle,
  Clock, FileText, Search, Bot, Database,
  Building2, Zap, Waves, Flame, Mountain, Plane,
  TreePine, Calendar, User, Mail, DollarSign,
  Layers, Landmark, Scale, Activity,
} from "lucide-react";
import type { ProjectSection } from "@/components/ProjectNav";
import { useReconStream, TopProgressBar, AgentPopup } from "@/components/ReconProgressModal";

// ── Types ──

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

interface BuildingPermit {
  id: string;
  permit_number: string | null;
  permit_type: string | null;
  permit_status: string;
  description: string | null;
  valuation: number | null;
  sqft: number | null;
  issued_date: string | null;
  expired_date: string | null;
  finalized_date: string | null;
  inspections_count: number;
  last_inspection_date: string | null;
  last_inspection_result: string | null;
}

interface CECase {
  id: string;
  case_number: string | null;
  violation_type: string | null;
  violation_description: string | null;
  severity: string;
  status: string;
  notice_served_date: string | null;
  compliance_deadline: string | null;
  abatement_date: string | null;
  hearing_date: string | null;
  appeal_filed: number;
  outcome: string | null;
}

// ── Helper Components ──

function HazardFlag({ label, present, detail, icon: Icon }: { label: string; present: boolean | null; detail?: string | null; icon?: typeof ShieldAlert }) {
  const StatusIcon = present ? ShieldAlert : present === false ? ShieldCheck : ShieldX;
  const color = present ? "text-fp-red border-fp-red/30 bg-fp-red/5" : present === false ? "text-fp-green border-fp-green/20 bg-fp-green/5" : "text-fp-text-dim border-fp-border bg-fp-surface/20";
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${color}`}>
      {Icon ? <Icon className="w-4 h-4 shrink-0 mt-0.5" /> : <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-xs opacity-90 mt-0.5">
          {present === true ? (detail || "In hazard zone") : present === false ? "Clear" : "No data"}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon: Icon, children }: { label: string; value?: string | null; icon?: typeof Database; children?: React.ReactNode }) {
  return (
    <div className="surface-flat rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-3.5 h-3.5 text-fp-text-dim" />}
        <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">{label}</div>
      </div>
      {value !== undefined ? (
        <div className="text-sm font-semibold text-fp-text">{value || "—"}</div>
      ) : children}
    </div>
  );
}

function Section({ title, icon: Icon, children, action }: { title: string; icon: typeof Database; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fp-text flex items-center gap-2">
          <Icon className="w-4 h-4 text-fp-text-dim" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function caseTypeLabel(ct: string) {
  const labels: Record<string, string> = { code_enforcement: "Code Enforcement", building: "Building Dept", adu_permit: "ADU Permit", other: "Other" };
  return labels[ct] ?? ct;
}

// ── Main Component ──

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
  const [permits, setPermits] = useState<BuildingPermit[]>([]);
  const [ceCases, setCeCases] = useState<CECase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAgentPopup, setShowAgentPopup] = useState(false);
  const [agentPopupMinimized, setAgentPopupMinimized] = useState(false);

  const { state: reconState, start: startRecon } = useReconStream(projectId, true, () => {
    // Refresh data when recon completes
    fetchData();
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [propRes, intelRes, overviewRes, findingsRes, permitsRes, ceRes] = await Promise.all([
        fetch(`/api/v1/properties?id=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/intelligence/data?propertyId=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/overview?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/findings?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/permits?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/enforcement?projectId=${projectId}`, { headers: { "Cache-Control": "no-cache" } }),
      ]);

      if (propRes.ok) setData(await propRes.json());
      if (intelRes.ok) setIntel(await intelRes.json());
      else if (intelRes.status === 404) setIntel(null);
      if (overviewRes.ok) setOverview(await overviewRes.json());
      if (findingsRes.ok) {
        const f: any = await findingsRes.json();
        setFindings(Array.isArray(f) ? f : (f.findings || []));
      }
      if (permitsRes.ok) {
        const p: any = await permitsRes.json();
        setPermits(Array.isArray(p) ? p : (p.permits || []));
      }
      if (ceRes.ok) {
        const c: any = await ceRes.json();
        setCeCases(Array.isArray(c) ? c : (c.cases || []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load property data");
    } finally {
      setLoading(false);
    }
  }, [propertyId, projectId]);

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [fetchData]);

  // Show agent popup when recon starts running
  useEffect(() => {
    if (reconState.running) {
      setShowAgentPopup(true);
      setAgentPopupMinimized(false);
    }
  }, [reconState.running]);

  const handleRunRecon = useCallback(() => {
    setShowAgentPopup(true);
    setAgentPopupMinimized(false);
    startRecon();
  }, [startRecon]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" />
        Loading property intelligence…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="surface-flat rounded-xl p-4 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error ?? "No property data available"}</span>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const recon = intel?.raw_data || {};
  const ownerName = recon.parcel?.OWNER || recon.parcel?.OWNER1 || recon.owner?.owner_name || null;
  const ownerAddress = recon.parcel?.MAIL_ADD || recon.owner?.mailing_address || null;
  const taxValue = recon.parcel?.TAX_VALUE || recon.parcel?.AS_LAND || null;
  const yearBuilt = recon.parcel?.YEAR_BUILT || null;
  const lotSize = recon.parcel?.LOTSIZE || null;
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

  return (
    <div className="space-y-4 pb-8 max-w-5xl" role="region" aria-label="Property Intelligence">
      <TopProgressBar state={reconState} />

      {showAgentPopup && (
        <AgentPopup
          state={reconState}
          onClose={() => setShowAgentPopup(false)}
          onMinimize={() => setAgentPopupMinimized(!agentPopupMinimized)}
          minimized={agentPopupMinimized}
        />
      )}

      {/* ── Header ── */}
      <div className="glass rounded-xl p-4 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fp-text">Property Intelligence</h1>
            <p className="text-xs text-fp-text-dim mt-0.5">
              {intel?.fetched_at
                ? `Last scanned: ${intel.fetched_at.slice(0, 16).replace("T", " ")}`
                : "Never scanned — run recon to gather data"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => onNavigate("vault")} className="px-3 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-all flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Upload Evidence
            </button>
            <button
              onClick={handleRunRecon}
              disabled={reconState.running}
              className="px-3 py-1.5 rounded-lg bg-fp-blue text-white text-xs font-medium hover:bg-fp-blue/90 transition-colors flex items-center gap-2 disabled:opacity-50"
              title="Run full recon — updates all property data"
            >
              <Bot className="w-3.5 h-3.5" />
              {reconState.running ? "Running…" : "Run Recon"}
            </button>
            <button onClick={fetchData} className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2" title="Refresh data">
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>
        </div>

        {/* Investigation Brief */}
        <div>
          <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium mb-1">Situation</div>
          <p className="text-sm text-fp-text">
            {overview
              ? `${caseTypeLabel(overview.caseType)} case for ${overview.address || data.address || "this property"}. Status: ${overview.status || "Active"}.`
              : `Property investigation for ${data.address || "APN " + data.apn}.`}
          </p>
        </div>

        {/* Known / Uncertain */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Known</div>
            {(() => {
              const known: string[] = [];
              if (ownerName) known.push(`Record owner: ${ownerName}`);
              if (intel?.zoning) known.push(`Zoning: ${intel.zoning}`);
              if (data.acres) known.push(`Parcel size: ${data.acres.toFixed(2)} acres`);
              if (intel?.general_plan) known.push(`General plan: ${intel.general_plan}`);
              if (evCount > 0) known.push(`${evCount} evidence documents`);
              if (tlCount > 0) known.push(`${tlCount} timeline events`);
              return known.length > 0 ? known.map((k, i) => (
                <div key={i} className="text-xs text-fp-text-muted flex items-start gap-1.5">
                  <ShieldCheck className="w-3 h-3 text-fp-green shrink-0 mt-0.5" /> {k}
                </div>
              )) : <div className="text-xs text-fp-text-dim">No confirmed facts yet</div>;
            })()}
          </div>
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Uncertain</div>
            {(() => {
              const uncertain: string[] = [];
              if (!ownerName) uncertain.push("Property owner not yet identified");
              if (!intel?.coastal_zone || intel.coastal_zone === "No data") uncertain.push("Coastal zone status unclear");
              if (missingInfoFindings.length > 0) uncertain.push(`${missingInfoFindings.length} findings have missing evidence`);
              return uncertain.length > 0 ? uncertain.map((u, i) => (
                <div key={i} className="text-xs text-fp-text-muted flex items-start gap-1.5">
                  <AlertCircle className="w-3 h-3 text-fp-amber shrink-0 mt-0.5" /> {u}
                </div>
              )) : <div className="text-xs text-fp-text-dim">No uncertainties identified</div>;
            })()}
          </div>
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
      <Section title="Property Identity" icon={MapPin}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">ASSESSOR'S PARCEL NUMBER (APN)</div>
            <div className="font-mono text-xl font-bold tracking-tight text-fp-text mt-0.5">{data.apn}</div>
          </div>
          <div className="text-sm text-fp-text-muted flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" /> {data.address ? `${data.address}, ${data.city || ""}` : "Unassigned Address"}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-fp-border/50">
          {overview && (
            <InfoCard label="Case Type" value={caseTypeLabel(overview.caseType)} icon={FileText} />
          )}
          {overview?.openedAt && (
            <InfoCard label="Opened" value={overview.openedAt.slice(0, 10)} icon={Calendar} />
          )}
          <InfoCard label="Status" value={overview?.status || "Active"} icon={Activity} />
          <InfoCard label="Parcel Size" value={data.acres ? `${data.acres.toFixed(2)} ac` : "—"} icon={Layers} />
        </div>
      </Section>

      {/* ── Activity Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Projects", value: data.projectCount ?? 0, sub: "investigations" },
          { label: "Evidence", value: evCount, sub: "documents" },
          { label: "Timeline", value: tlCount, sub: "events" },
          { label: "Findings", value: findingsCount ?? 0, sub: "due process" },
        ].map((s) => (
          <div key={s.label} className="surface-flat rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">{s.label}</div>
            <div className="text-lg font-semibold text-fp-text mt-1">{s.value}</div>
            <div className="text-[10px] text-fp-text-dim mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Owner & Ownership ── */}
      <Section title="Owner & Ownership" icon={User}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <InfoCard label="Record Owner" value={ownerName || "Not identified"} icon={User} />
          <InfoCard label="Mailing Address" value={ownerAddress || "Not on file"} icon={Mail} />
          <InfoCard label="Assessed Value" value={taxValue ? `$${Number(taxValue).toLocaleString()}` : "Not available"} icon={DollarSign} />
          <InfoCard label="Legal Description" value={intel?.legal_description || data.legal_desc || "Not recorded"} icon={FileText} />
        </div>
      </Section>

      {/* ── Parcel Characteristics ── */}
      <Section title="Parcel Characteristics" icon={Building2}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <InfoCard label="Zoning" value={intel?.zoning || data.zoning || "—"} icon={Layers} />
          <InfoCard label="General Plan" value={intel?.general_plan || "—"} icon={Landmark} />
          <InfoCard label="Year Built" value={yearBuilt || "—"} icon={Calendar} />
          <InfoCard label="Lot Size" value={lotSize ? `${Number(lotSize).toLocaleString()} sqft` : data.acres ? `${data.acres.toFixed(2)} ac` : "—"} icon={Layers} />
        </div>
      </Section>

      {/* ── Environmental Hazards ── */}
      <Section title="Environmental Hazards" icon={ShieldAlert}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HazardFlag label="Coastal Zone" present={intel?.coastal_zone === "Yes"} icon={Waves} detail={recon.coastal_zone?.detail} />
          <HazardFlag label="FEMA Flood Zone" present={intel?.flood_zone === "Yes"} icon={Waves} detail={recon.flood?.detail} />
          <HazardFlag label="Fire Hazard" present={intel?.fire_responsibility ? intel.fire_responsibility !== "None" && intel.fire_responsibility !== "Local Responsibility" : null} icon={Flame} detail={intel?.fire_responsibility || undefined} />
          <HazardFlag label="Tsunami Zone" present={recon.tsunami?.in_tsunami_zone ?? null} icon={Waves} detail={recon.tsunami?.detail} />
          <HazardFlag label="Seismic (Liquefaction)" present={recon.seismic?.liquefaction ?? null} icon={Activity} detail={recon.seismic?.detail} />
          <HazardFlag label="Landslide" present={recon.seismic?.landslide ?? null} icon={Mountain} detail={recon.seismic?.landslide_detail} />
          <HazardFlag label="Earthquake Fault" present={recon.seismic?.fault_zone ?? null} icon={Activity} detail={recon.seismic?.fault_detail} />
          <HazardFlag label="Sea Level Rise" present={recon.sea_level_rise?.at_risk ?? null} icon={Waves} detail={recon.sea_level_rise?.detail} />
          <HazardFlag label="Airport Compatibility" present={recon.airport?.in_zone ?? null} icon={Plane} detail={recon.airport?.detail} />
          <HazardFlag label="Williamson Act" present={recon.natural_resources?.williamson_act ?? null} icon={TreePine} detail={recon.natural_resources?.williamson_detail} />
          <HazardFlag label="Wetlands" present={recon.natural_resources?.wetlands ?? null} icon={TreePine} detail={recon.natural_resources?.wetlands_detail} />
          <HazardFlag label="Streamside Conservation" present={recon.natural_resources?.streamside ?? null} icon={TreePine} detail={recon.natural_resources?.streamside_detail} />
        </div>
      </Section>

      {/* ── Jurisdiction & Districts ── */}
      <Section title="Jurisdiction & Districts" icon={Landmark}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <InfoCard label="City/County" value={recon.jurisdiction?.city || recon.jurisdiction?.county || data.city || "Humboldt County"} icon={Building2} />
          <InfoCard label="Supervisorial District" value={recon.jurisdiction?.supervisor_district || "—"} icon={Landmark} />
          <InfoCard label="School District" value={recon.jurisdiction?.school_district || "—"} icon={Building2} />
          <InfoCard label="Fire District" value={recon.jurisdiction?.fire_district || "—"} icon={Flame} />
          <InfoCard label="City Boundary" value={recon.jurisdiction?.in_city ? "Inside city limits" : recon.jurisdiction?.in_city === false ? "Unincorporated" : "—"} icon={MapPin} />
          <InfoCard label="ADU Eligibility" value={recon.adu?.eligible ? "Eligible" : recon.adu?.eligible === false ? "Not eligible" : "—"} icon={Building2} />
        </div>
      </Section>

      {/* ── Building Permits ── */}
      {permits.length > 0 && (
        <Section
          title={`Building Permits (${permits.length})`}
          icon={FileText}
          action={
            <button onClick={() => onNavigate("authority")} className="text-xs text-fp-blue hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          }
        >
          <div className="space-y-2">
            {permits.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
                <FileText className="w-3.5 h-3.5 text-fp-text-dim shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fp-text">{p.permit_number || "No #"}</div>
                  <div className="text-[10px] text-fp-text-dim">{p.permit_type || "Unknown type"} · {p.permit_status}</div>
                </div>
                {p.valuation && <div className="text-xs text-fp-text-muted shrink-0">${p.valuation.toLocaleString()}</div>}
                {p.issued_date && <div className="text-[10px] text-fp-text-dim shrink-0">{p.issued_date.slice(0, 10)}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Code Enforcement Cases ── */}
      {ceCases.length > 0 && (
        <Section
          title={`Code Enforcement (${ceCases.length})`}
          icon={ShieldAlert}
          action={
            <button onClick={() => onNavigate("authority")} className="text-xs text-fp-blue hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          }
        >
          <div className="space-y-2">
            {ceCases.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
                <ShieldAlert className={`w-3.5 h-3.5 shrink-0 ${c.severity === "critical" ? "text-fp-red" : c.severity === "warning" ? "text-fp-amber" : "text-fp-text-dim"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fp-text">{c.case_number || "No case #"}</div>
                  <div className="text-[10px] text-fp-text-dim">{c.violation_type || "Unknown violation"} · {c.status}</div>
                </div>
                {c.notice_served_date && <div className="text-[10px] text-fp-text-dim shrink-0">Notice: {c.notice_served_date.slice(0, 10)}</div>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Due Process Findings ── */}
      {openFindings.length > 0 && (
        <Section
          title={`Due Process Findings (${openFindings.length})`}
          icon={Scale}
          action={
            <button onClick={() => onNavigate("analysis")} className="text-xs text-fp-blue hover:underline flex items-center gap-1">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          }
        >
          <div className="space-y-2">
            {openFindings.slice(0, 5).map((f) => (
              <div key={f.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
                <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${f.severity === "critical" ? "bg-fp-red" : f.severity === "warning" ? "bg-fp-amber" : "bg-fp-blue"}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-fp-text">{f.rule_name || f.rule}</div>
                  {f.detail && <div className="text-[10px] text-fp-text-dim mt-0.5 line-clamp-2">{f.detail}</div>}
                </div>
                {f.missing_info ? <span className="text-[9px] px-1.5 py-0.5 rounded bg-fp-amber/20 text-fp-amber shrink-0">Missing info</span> : null}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* ── Recon History ── */}
      {intel?.fetched_at && (
        <div className="text-[10px] text-fp-text-dim text-center pt-2">
          Property intelligence cached from recon on {intel.fetched_at.slice(0, 16).replace("T", " ")}. Re-running recon updates this data — existing records are preserved.
        </div>
      )}
    </div>
  );
}
