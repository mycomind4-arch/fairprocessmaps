"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Building2, Ruler, FileText, Landmark,
  Calendar, Hash, Database, Loader2, AlertCircle, RefreshCw,
  Waves, Flame, Activity, Mountain, Plane, TreePine, Home,
  ShieldAlert, ShieldCheck, ShieldX, ScrollText,
} from "lucide-react";

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

function FieldRow({
  icon: Icon, label, value,
}: { icon: typeof MapPin; label: string; value: string | number | null | undefined }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-fp-border/40 last:border-0">
      <Icon className="w-3.5 h-3.5 text-fp-text-dim shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">{label}</div>
        <div className="text-sm text-fp-text mt-0.5 break-words">{value ?? "—"}</div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-fp-border bg-fp-surface/40 p-4">
      <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium">{label}</div>
      <div className="text-2xl font-semibold text-fp-text mt-1">{value}</div>
      {sub && <div className="text-[11px] text-fp-text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

function HazardFlag({
  label, present, detail,
}: { label: string; present: boolean | null; detail?: string | null }) {
  const StatusIcon = present ? ShieldAlert : present === false ? ShieldCheck : ShieldX;
  const color = present ? "text-fp-red border-fp-red/30 bg-fp-red/5" : present === false ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/5" : "text-fp-text-dim border-fp-border bg-fp-surface/20";

  return (
    <div className={`flex items-start gap-2.5 rounded-lg border p-3 ${color}`}>
      <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[11px] opacity-80 mt-0.5">
          {present === true ? (detail || "In hazard zone") : present === false ? "Not in hazard zone" : "No data"}
        </div>
      </div>
    </div>
  );
}

function AgentSection({
  title, icon: Icon, children,
}: { title: string; icon: typeof MapPin; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-fp-cyan" />
        <h3 className="text-sm font-medium text-fp-text">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function PropertyIntelligence({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<PropertyData | null>(null);
  const [intel, setIntel] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [propRes, intelRes] = await Promise.all([
        fetch(`/api/v1/properties?id=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
        fetch(`/api/v1/intelligence/data?propertyId=${propertyId}`, { headers: { "Cache-Control": "no-cache" } }),
      ]);

      if (propRes.ok) {
        setData(await propRes.json());
      }

      if (intelRes.ok) {
        setIntel(await intelRes.json());
      } else if (intelRes.status === 404) {
        setIntel(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load property data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [propertyId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-fp-text-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading property intelligence…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center gap-2 text-fp-red text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        <span>{error ?? "No data"}</span>
        <button onClick={fetchData} className="ml-2 p-1 rounded hover:bg-fp-surface-2">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  const recon = intel?.raw_data || {};

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fp-text">Property Intelligence</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">
            Full reconnaissance report for APN {data.apn}
            {intel?.fetched_at && ` · Last recon: ${intel.fetched_at.slice(0, 16).replace("T", " ")}`}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="p-2 rounded-lg text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2"
          title="Refresh data"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Projects" value={data.projectCount ?? 0} sub="enforcement cases" />
        <StatCard label="Evidence" value={data.evidenceCount ?? 0} sub="documents" />
        <StatCard label="Timeline" value={data.timelineCount ?? 0} sub="events logged" />
        <StatCard label="Acres" value={data.acres ? data.acres.toFixed(2) : "—"} sub="parcel size" />
      </div>

      {/* Parcel Identity */}
      <AgentSection title="Parcel Identity" icon={Hash}>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <FieldRow icon={Hash} label="APN" value={data.apn} />
            <FieldRow icon={MapPin} label="Address" value={data.address} />
            <FieldRow icon={Building2} label="City" value={data.city} />
            <FieldRow icon={Ruler} label="Zoning" value={data.zoning} />
          </div>
          <div>
            <FieldRow icon={Landmark} label="General Plan" value={recon.zoning?.general_plan || intel?.general_plan} />
            <FieldRow icon={Calendar} label="Last Transfer" value={recon.parcel?.TRANDATE ? new Date(recon.parcel.TRANDATE).toISOString().slice(0,10) : "—"} />
            <FieldRow icon={Calendar} label="Year Built" value={recon.parcel?.YEAR_BUILT?.trim() || "—"} />
            <FieldRow icon={FileText} label="Book/Page" value={recon.parcel?.BKPG || "—"} />
          </div>
        </div>
        {data.legal_desc && (
          <div className="mt-3 pt-3 border-t border-fp-border/40">
            <div className="text-[10px] uppercase tracking-wider text-fp-text-dim font-medium mb-1">Legal Description</div>
            <p className="text-sm text-fp-text-muted leading-relaxed">{data.legal_desc}</p>
          </div>
        )}
      </AgentSection>

      {/* Environmental Hazards */}
      <AgentSection title="Environmental Hazards" icon={ShieldAlert}>
        <div className="grid grid-cols-3 gap-3">
          <HazardFlag label="Coastal Zone" present={recon.coastal_zone?.in_coastal_zone} detail={recon.coastal_zone?.coastal_basis} />
          <HazardFlag label="FEMA Flood Zone" present={recon.flood?.in_flood_zone} detail={recon.flood?.flood_zone_code ? `Zone ${recon.flood.flood_zone_code}` : null} />
          <HazardFlag label="Fire Hazard" present={recon.fire?.fire_hazard_severity ? true : null} detail={recon.fire?.fire_hazard_severity} />
          <HazardFlag label="Tsunami Zone" present={recon.tsunami?.in_tsunami_zone} />
          <HazardFlag label="Earthquake Fault" present={recon.seismic?.in_earthquake_fault_zone} />
          <HazardFlag label="Liquefaction" present={recon.seismic?.liquefaction_zone ? true : null} detail={recon.seismic?.liquefaction_zone} />
          <HazardFlag label="Landslide Risk" present={recon.seismic?.landslide_feature ? true : null} detail={recon.seismic?.landslide_feature} />
          <HazardFlag label="Sea Level Rise" present={recon.sea_level_rise?.sea_level_rise_risk} />
          <HazardFlag label="Airport Compatibility" present={recon.airport?.in_airport_zone} detail={recon.airport?.airport_zone} />
        </div>
        {/* FEMA flood details */}
        {recon.flood?.in_flood_zone && (
          <div className="mt-3 pt-3 border-t border-fp-border/40 grid grid-cols-3 gap-x-4 text-xs">
            <div><span className="text-fp-text-dim">FIRM Panel:</span> <span className="text-fp-text">{recon.flood.firm_panel || "—"}</span></div>
            <div><span className="text-fp-text-dim">Eff. Date:</span> <span className="text-fp-text">{recon.flood.eff_date || "—"}</span></div>
            <div><span className="text-fp-text-dim">Floodway:</span> <span className="text-fp-text">{recon.flood.floodway ? "Yes" : "No"}</span></div>
          </div>
        )}
      </AgentSection>

      {/* Fire Details */}
      {recon.fire && (
        <AgentSection title="Fire Hazard Details" icon={Flame}>
          <div className="grid grid-cols-3 gap-x-8">
            <FieldRow icon={Flame} label="Severity" value={recon.fire.fire_hazard_severity} />
            <FieldRow icon={ShieldAlert} label="Responsibility" value={recon.fire.fire_responsibility} />
            <FieldRow icon={Hash} label="FHSZ Code" value={recon.fire.fire_hazard_code} />
          </div>
        </AgentSection>
      )}

      {/* Jurisdiction */}
      <AgentSection title="Jurisdiction & Districts" icon={Landmark}>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <FieldRow icon={Building2} label="Jurisdiction" value={recon.jurisdiction?.in_city_limits ? "City" : "County"} />
            <FieldRow icon={Hash} label="Supervisor District" value={recon.jurisdiction?.supervisor_district} />
          </div>
          <div>
            <FieldRow icon={Building2} label="School District" value={recon.jurisdiction?.school_district} />
            <FieldRow icon={Flame} label="Fire District" value={recon.jurisdiction?.fire_district} />
          </div>
        </div>
      </AgentSection>

      {/* Natural Resources */}
      <AgentSection title="Natural Resources" icon={TreePine}>
        <div className="grid grid-cols-3 gap-3">
          <HazardFlag label="Wetlands" present={recon.natural_resources?.has_wetlands} />
          <HazardFlag label="Williamson Act" present={recon.natural_resources?.williamson_act} detail={recon.natural_resources?.williamson_act_acres ? `${recon.natural_resources.williamson_act_acres} acres` : null} />
          <HazardFlag label="Streamside Area" present={recon.natural_resources?.has_streamside_area} />
        </div>
      </AgentSection>

      {/* ADU Eligibility */}
      {recon.adu && (
        <AgentSection title="ADU Eligibility" icon={Home}>
          <div className="grid grid-cols-2 gap-x-8">
            <FieldRow icon={Home} label="ADU Status" value={recon.adu.adu_status} />
            <FieldRow icon={FileText} label="Trigger" value={recon.adu.adu_trigger} />
          </div>
        </AgentSection>
      )}

      {/* Zoning Details */}
      {recon.zoning && (recon.zoning.zoning_q || recon.zoning.community_plan) && (
        <AgentSection title="Zoning & Planning Details" icon={ScrollText}>
          <div className="grid grid-cols-2 gap-x-8">
            <FieldRow icon={Ruler} label="Q Overlay" value={recon.zoning.zoning_q} />
            <FieldRow icon={ScrollText} label="Q Description" value={recon.zoning.zoning_q_description} />
            <FieldRow icon={Landmark} label="Community Plan" value={recon.zoning.community_plan} />
            <FieldRow icon={MapPin} label="Planning Area" value={recon.zoning.planning_area} />
          </div>
        </AgentSection>
      )}

      {/* Recon Status */}
      {intel && (
        <div className="rounded-xl border border-fp-border bg-fp-surface/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-fp-cyan" />
            <h3 className="text-sm font-medium text-fp-text">Recon Status</h3>
          </div>
          <div className="text-xs text-fp-text-muted">
            Intelligence cache last updated: {intel.fetched_at?.replace("T", " ").slice(0, 19)}
            {" · "}
            {Object.keys(recon).length} agents with data
            {recon.parcel?.geom_geojson && " · Parcel geometry stored"}
          </div>
        </div>
      )}

      {/* Recon Not Yet Run */}
      {!intel && (
        <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-fp-blue/20 flex items-center justify-center">
              <span className="text-[10px] font-bold text-fp-blue">AI</span>
            </div>
            <h3 className="text-sm font-medium text-fp-text">Recon Not Yet Run</h3>
          </div>
          <p className="text-xs text-fp-text-dim">
            Property intelligence recon will run automatically when you open this project.
            If it hasn't started yet, try refreshing the page or click the recon button in the header.
          </p>
        </div>
      )}
    </div>
  );
}
