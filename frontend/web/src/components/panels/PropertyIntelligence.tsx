"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Loader2, AlertCircle, RefreshCw,
  ShieldAlert, ShieldCheck, ShieldX,
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
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${color}`}>
      <StatusIcon className="w-4 h-4 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide">{label}</div>
        <div className="text-xs opacity-90 mt-0.5">
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
    <div className="surface-flat rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-fp-text">{title}</h2>
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
      <div className="flex items-center justify-center p-8 text-fp-text-muted text-sm gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-fp-blue" /> Loading property intelligence…
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
        <button
          onClick={fetchData}
          className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2"
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
    <div className="space-y-4 pb-8">
      {/* Header & APN */}
      <div className="glass rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fp-text">Property Intelligence</h1>
            <p className="text-xs text-fp-text-dim mt-0.5">
              Automated reconnaissance report
              {intel?.fetched_at && ` · Last scanned: ${intel.fetched_at.slice(0, 16).replace("T", " ")}`}
            </p>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 rounded-lg bg-fp-surface-2 border border-fp-border text-xs text-fp-text hover:bg-fp-surface transition-colors flex items-center gap-2 self-start md:self-auto"
            title="Refresh reconnaissance"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Recon
          </button>
        </div>

        {/* APN banner */}
        <div className="p-3 rounded-lg bg-fp-surface-2/80 border border-fp-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">ASSESSOR'S PARCEL NUMBER (APN)</div>
            <div className="font-mono text-xl font-bold tracking-tight text-fp-text mt-0.5">{data.apn}</div>
          </div>
          <div className="text-sm text-fp-text-muted flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5" />
            {data.address ? `${data.address}, ${data.city || ""}` : "Unassigned Address"}
          </div>
        </div>
      </div>

      {/* Compact Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Enforcement Cases", value: data.projectCount ?? 0, sub: "projects" },
          { label: "Evidence", value: data.evidenceCount ?? 0, sub: "documents" },
          { label: "Timeline", value: data.timelineCount ?? 0, sub: "events" },
          { label: "Parcel Size", value: data.acres ? `${data.acres.toFixed(2)} ac` : "—", sub: "acreage" },
        ].map((s) => (
          <div key={s.label} className="surface-flat rounded-lg p-3">
            <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">{s.label}</div>
            <div className="text-lg font-semibold text-fp-text mt-1">{s.value}</div>
            <div className="text-[10px] text-fp-text-dim mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Owner & Ownership */}
      <AgentSection title="Owner & Ownership Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-2 p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Record Owner</div>
              <div className="text-sm font-semibold text-fp-text mt-0.5">{ownerName || "No owner record on file"}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Mailing Address</div>
              <div className="text-sm text-fp-text-muted mt-0.5">{ownerAddress || "—"}</div>
            </div>
          </div>

          <div className="space-y-2 p-3 rounded-lg bg-fp-surface-2/40 border border-fp-border/60">
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Last Transfer</span>
              <span className="font-mono text-fp-text text-sm">{recon.parcel?.TRANDATE ? new Date(recon.parcel.TRANDATE).toLocaleDateString() : "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm border-b border-fp-border/40 pb-1.5">
              <span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">Zoning</span>
              <span className="text-fp-text text-sm font-medium">{intel?.zoning || data.zoning || "—"}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-[10px] uppercase tracking-wide text-fp-text-dim font-medium">General Plan</span>
              <span className="text-fp-text text-sm">{intel?.general_plan || "—"}</span>
            </div>
          </div>
        </div>
      </AgentSection>

      {/* Hazard Flags */}
      <AgentSection title="Hazard & Zone Designations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <HazardFlag label="Coastal Zone" present={intel?.coastal_zone === "Yes" || (intel?.coastal_zone && intel.coastal_zone !== "No" && intel.coastal_zone !== null) ? true : intel?.coastal_zone === "No" ? false : null} detail={intel?.coastal_zone} />
          <HazardFlag label="Flood Zone" present={intel?.flood_zone && intel.flood_zone !== "No" && intel.flood_zone !== "None" ? true : intel?.flood_zone === "No" || intel?.flood_zone === "None" ? false : null} detail={intel?.flood_zone} />
          <HazardFlag label="Fire Responsibility" present={intel?.fire_responsibility && intel.fire_responsibility !== "No" ? true : false} detail={intel?.fire_responsibility} />
          <HazardFlag label="Legal Description" present={data.legal_desc ? true : null} detail={data.legal_desc} />
        </div>
      </AgentSection>

      {/* Property Location */}
      {(data.centroid_lat != null && data.centroid_lng != null) && (
        <div className="surface-flat rounded-xl p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-fp-text">Property Location</h2>
            <div className="text-xs font-mono text-fp-text-dim">
              {data.centroid_lat.toFixed(6)}°, {data.centroid_lng.toFixed(6)}°
            </div>
          </div>
          <div className="h-28 rounded-lg bg-fp-surface-2 border border-fp-border relative overflow-hidden flex items-center justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-fp-surface-2 via-fp-bg to-fp-surface-2 opacity-90" />
            <div className="relative z-10 text-center p-2">
              <div className="w-8 h-8 rounded-full bg-fp-blue/20 border border-fp-blue/40 flex items-center justify-center mx-auto text-fp-blue">
                <MapPin className="w-4 h-4" />
              </div>
              <div className="text-xs font-semibold text-fp-text mt-1">{data.address || `APN ${data.apn}`}</div>
              <div className="text-[10px] font-mono text-fp-text-dim">{data.city ? `${data.city}, ${data.county || ""}` : data.county || ""}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
