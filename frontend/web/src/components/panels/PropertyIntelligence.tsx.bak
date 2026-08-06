"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Loader2, AlertCircle, RefreshCw,
  ShieldAlert, ShieldCheck, ShieldX, Database,
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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 hover:-translate-y-0.5 transition-all duration-200">
      <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">{label}</div>
      <div className="text-2xl font-semibold text-fp-text mt-1">{value}</div>
      {sub && <div className="text-xs text-fp-text-dim mt-1">{sub}</div>}
    </div>
  );
}

function HazardFlag({
  label, present, detail,
}: { label: string; present: boolean | null; detail?: string | null }) {
  const StatusIcon = present ? ShieldAlert : present === false ? ShieldCheck : ShieldX;
  const color = present
    ? "text-fp-red border-fp-red/30 bg-fp-red/5"
    : present === false
    ? "text-fp-green border-fp-green/20 bg-fp-green/5"
    : "text-fp-text-dim border-fp-border bg-fp-surface/20";

  return (
    <div className={`flex items-start gap-3 rounded-[14px] border p-4 transition-colors ${color}`}>
      <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-xs opacity-90 mt-1">
          {present === true ? (detail || "In hazard zone") : present === false ? "Not in hazard zone" : "No data"}
        </div>
      </div>
    </div>
  );
}

function AgentSection({
  title, children,
}: { title: string; children: React.ReactNode }) {
  return (
    <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
      <h2 className="text-base font-semibold text-fp-text">{title}</h2>
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
      <div className="flex items-center justify-center p-12 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading property intelligence…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 flex items-center justify-between">
        <div className="flex items-center gap-3 text-fp-red text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error ?? "No property data available"}</span>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const recon = intel?.raw_data || {};
  const ownerName = recon.parcel?.OWNER || recon.parcel?.OWNER1 || recon.owner?.owner_name || null;
  const ownerAddress = recon.parcel?.MAIL_ADD || recon.owner?.mailing_address || null;

  return (
    <div className="space-y-6 pb-8">
      {/* Header & Prominent APN Banner */}
      <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-fp-text">Property Intelligence</h1>
            <p className="text-xs text-fp-text-dim mt-1">
              Automated reconnaissance report
              {intel?.fetched_at && ` · Last scanned: ${intel.fetched_at.slice(0, 16).replace("T", " ")}`}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-2 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2 self-start md:self-auto"
            title="Refresh reconnaissance"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Recon
          </button>
        </div>

        {/* High-visibility APN banner */}
        <div className="p-4 rounded-[14px] bg-fp-surface-2/80 border border-fp-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">ASSESSOR'S PARCEL NUMBER (APN)</div>
            <div className="font-mono text-2xl font-bold tracking-tight text-fp-text mt-1">{data.apn}</div>
          </div>
          <div className="text-sm text-fp-text-muted">
            {data.address ? `${data.address}, ${data.city || ""}` : "Unassigned Address"}
          </div>
        </div>
      </div>

      {/* Prominent Property Location/Map Container */}
      {(data.centroid_lat != null && data.centroid_lng != null) && (
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-fp-text">Property Location</h2>
            <div className="text-xs font-mono text-fp-text-dim">
              {data.centroid_lat.toFixed(6)}°, {data.centroid_lng.toFixed(6)}°
            </div>
          </div>
          <div className="h-48 md:h-56 rounded-[14px] bg-fp-surface-2 border border-fp-border relative overflow-hidden flex items-center justify-center">
            {/* Geographic preview placeholder / visual header */}
            <div className="absolute inset-0 bg-gradient-to-br from-fp-surface-2 via-fp-bg to-fp-surface-2 opacity-90" />
            <div className="relative z-10 text-center space-y-2 p-4">
              <div className="w-10 h-10 rounded-full bg-fp-blue/20 border border-fp-blue/40 flex items-center justify-center mx-auto text-fp-blue">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="text-sm font-semibold text-fp-text">{data.address || `APN ${data.apn}`}</div>
              <div className="text-xs font-mono text-fp-text-dim">{data.city ? `${data.city}, ${data.county || ""}` : data.county || ""}</div>
            </div>
          </div>
        </div>
      )}

      {/* Key Metric Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 items-stretch">
        <StatCard label="Enforcement Cases" value={data.projectCount ?? 0} sub="associated projects" />
        <StatCard label="Evidence Vault" value={data.evidenceCount ?? 0} sub="uploaded documents" />
        <StatCard label="Timeline Log" value={data.timelineCount ?? 0} sub="logged events" />
        <StatCard label="Parcel Size" value={data.acres ? `${data.acres.toFixed(2)} acres` : "—"} sub="total acreage" />
      </div>

      {/* Grouped Owner & Ownership Information */}
      <AgentSection title="Owner & Ownership Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3 p-4 rounded-[14px] bg-fp-surface-2/40 border border-fp-border/60">
            <div>
              <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Record Owner</div>
              <div className="text-sm font-semibold text-fp-text mt-1">{ownerName || "No owner record on file"}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Mailing Address</div>
              <div className="text-sm text-fp-text-muted mt-1">{ownerAddress || "—"}</div>
            </div>
          </div>

          <div className="space-y-3 p-4 rounded-[14px] bg-fp-surface-2/40 border border-fp-border/60">
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-2">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Last Transfer Date</span>
              <span className="font-mono text-fp-text">{recon.parcel?.TRANDATE ? new Date(recon.parcel.TRANDATE).toISOString().slice(0, 10) : "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-2">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Deed Book / Page</span>
              <span className="font-mono text-fp-text">{recon.parcel?.BKPG || "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Tax Value</span>
              <span className="font-mono text-fp-text">{recon.parcel?.TAX_VALUE ? `$${Number(recon.parcel.TAX_VALUE).toLocaleString()}` : "—"}</span>
            </div>
          </div>
        </div>
      </AgentSection>

      {/* Parcel Identity in Clean 2-Column Grid */}
      <AgentSection title="Parcel Specifications">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Parcel APN</span>
              <span className="font-mono text-sm text-fp-text font-semibold">{data.apn}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Site Address</span>
              <span className="text-sm text-fp-text">{data.address || "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">City / Jurisdiction</span>
              <span className="text-sm text-fp-text">{data.city || "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Zoning Code</span>
              <span className="text-sm text-fp-text font-medium">{data.zoning || "—"}</span>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">General Plan Designation</span>
              <span className="text-sm text-fp-text">{recon.zoning?.general_plan || intel?.general_plan || "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Year Built</span>
              <span className="font-mono text-sm text-fp-text">{recon.parcel?.YEAR_BUILT?.trim() || "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Acreage</span>
              <span className="font-mono text-sm text-fp-text">{data.acres ? `${data.acres.toFixed(2)} acres` : "—"}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-fp-border/40">
              <span className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Supervisor District</span>
              <span className="text-sm text-fp-text">{recon.jurisdiction?.supervisor_district || "—"}</span>
            </div>
          </div>
        </div>

        {data.legal_desc && (
          <div className="mt-4 pt-4 border-t border-fp-border/40 space-y-1">
            <div className="text-xs uppercase tracking-wider text-fp-text-dim font-medium">Legal Description</div>
            <p className="text-sm text-fp-text-muted leading-relaxed font-mono text-xs">{data.legal_desc}</p>
          </div>
        )}
      </AgentSection>

      {/* Environmental Hazards */}
      <AgentSection title="Environmental Hazards & Overlays">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <HazardFlag label="Coastal Zone" present={recon.coastal_zone?.in_coastal_zone} detail={recon.coastal_zone?.coastal_basis} />
          <HazardFlag label="FEMA Flood Zone" present={recon.flood?.in_flood_zone} detail={recon.flood?.flood_zone_code ? `Zone ${recon.flood.flood_zone_code}` : null} />
          <HazardFlag label="Fire Hazard" present={recon.fire?.fire_hazard_severity ? true : null} detail={recon.fire?.fire_hazard_severity} />
          <HazardFlag label="Tsunami Risk" present={recon.tsunami?.in_tsunami_zone} />
          <HazardFlag label="Earthquake Fault" present={recon.seismic?.in_earthquake_fault_zone} />
          <HazardFlag label="Liquefaction" present={recon.seismic?.liquefaction_zone ? true : null} detail={recon.seismic?.liquefaction_zone} />
          <HazardFlag label="Landslide Risk" present={recon.seismic?.landslide_feature ? true : null} detail={recon.seismic?.landslide_feature} />
          <HazardFlag label="Sea Level Rise" present={recon.sea_level_rise?.sea_level_rise_risk} />
          <HazardFlag label="Airport Compatibility" present={recon.airport?.in_airport_zone} detail={recon.airport?.airport_zone} />
        </div>
      </AgentSection>

      {/* Recon Status Footer */}
      {intel ? (
        <div className="glass rounded-[14px] p-6 border-fp-border shadow-lg shadow-black/20 flex items-center gap-3 text-xs text-fp-text-muted">
          <Database className="w-4 h-4 text-fp-blue shrink-0" />
          <div>
            Intelligence cache last updated: <span className="font-mono text-fp-text">{intel.fetched_at?.replace("T", " ").slice(0, 19)}</span>
            {" · "}{Object.keys(recon).length} data modules compiled
          </div>
        </div>
      ) : (
        <div className="glass rounded-[14px] border-dashed border-fp-border p-6 text-center space-y-2">
          <h2 className="text-base font-semibold text-fp-text">Reconnaissance Not Yet Executed</h2>
          <p className="text-sm text-fp-text-muted max-w-md mx-auto">
            Property intelligence scans public GIS datasets automatically. Click below to run reconnaissance on this parcel.
          </p>
          <div className="pt-2">
            <button
              onClick={fetchData}
              className="px-4 py-2 rounded-lg bg-fp-blue text-white text-sm font-medium hover:bg-fp-blue/90 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" /> Run Parcel Recon
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
