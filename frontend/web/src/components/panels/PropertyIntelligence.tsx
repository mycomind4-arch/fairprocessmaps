"use client";

import { useEffect, useState } from "react";
import {
  MapPin, Building2, Ruler, FileText, Landmark,
  Calendar, Hash, Database, Loader2, AlertCircle, RefreshCw,
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

export default function PropertyIntelligence({ propertyId }: { propertyId: string }) {
  const [data, setData] = useState<PropertyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/properties?id=${propertyId}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Failed to load: ${res.status} ${txt.slice(0, 200)}`);
      }
      const json = await res.json();
      setData(json as PropertyData);
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

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fp-text">Property Intelligence</h2>
          <p className="text-xs text-fp-text-dim mt-0.5">
            Public records & parcel data for APN {data.apn}
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

      {/* Property identity card */}
      <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
        <h3 className="text-sm font-medium text-fp-text mb-1">Parcel Identity</h3>
        <div className="grid grid-cols-2 gap-x-8">
          <div>
            <FieldRow icon={Hash} label="APN" value={data.apn} />
            <FieldRow icon={MapPin} label="Address" value={data.address} />
            <FieldRow icon={Landmark} label="County" value={data.county} />
            <FieldRow icon={Building2} label="City" value={data.city} />
          </div>
          <div>
            <FieldRow icon={Ruler} label="Zoning" value={data.zoning} />
            <FieldRow icon={Calendar} label="Created" value={data.created_at?.slice(0, 10)} />
            <FieldRow icon={Calendar} label="Updated" value={data.updated_at?.slice(0, 10)} />
            <FieldRow
              icon={MapPin}
              label="Coordinates"
              value={data.centroid_lat != null && data.centroid_lng != null
                ? `${data.centroid_lat.toFixed(6)}, ${data.centroid_lng.toFixed(6)}`
                : null}
            />
          </div>
        </div>
      </div>

      {/* Legal description card */}
      {data.legal_desc && (
        <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-fp-cyan" />
            <h3 className="text-sm font-medium text-fp-text">Legal Description</h3>
          </div>
          <p className="text-sm text-fp-text-muted leading-relaxed">{data.legal_desc}</p>
        </div>
      )}

      {/* Geometry info */}
      {data.geom_geojson && (
        <div className="rounded-xl border border-fp-border bg-fp-surface/40 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-fp-cyan" />
            <h3 className="text-sm font-medium text-fp-text">Parcel Geometry</h3>
          </div>
          <p className="text-xs text-fp-text-muted">
            Boundary polygon stored in GeoJSON format.
            {" "}
            {data.geom_geojson.includes("Polygon")
              ? "Multi-coordinate parcel boundary available for map rendering."
              : "Point representation."}
          </p>
        </div>
      )}

      {/* AI Intelligence placeholder */}
      <div className="rounded-xl border border-dashed border-fp-border bg-fp-surface/20 p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-fp-blue/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-fp-blue">AI</span>
          </div>
          <h3 className="text-sm font-medium text-fp-text">AI-Enriched Intelligence</h3>
        </div>
        <div className="space-y-2">
          {[
            { label: "Owner & Title History", desc: "Recorded deeds, transfers, liens" },
            { label: "Assessed Value & Tax Status", desc: "Current assessment, delinquency" },
            { label: "Comparable Properties", desc: "Nearby parcels with similar zoning" },
            { label: "Permit History", desc: "Building permits, code cases" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-1.5">
              <div>
                <div className="text-sm text-fp-text">{item.label}</div>
                <div className="text-[11px] text-fp-text-dim">{item.desc}</div>
              </div>
              <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-fp-surface-2 text-fp-text-dim">
                Pending
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
