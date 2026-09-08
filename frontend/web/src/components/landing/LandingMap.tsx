"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MaplibreMap,
  NavigationControl,
  type Map as MaplibreMapType,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { ArrowRight, MapPin, Search } from "lucide-react";
import propertyThumb from "@/assets/property-thumb.jpg";
import RasterMap from "@/components/RasterMap";
import { supportsWebGL2 } from "@/lib/map-support";

const HUMBOLDT_CENTER: [number, number] = [-124.15, 40.81];
const HUMBOLDT_ZOOM = 11.2;

const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
const REFERENCE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
];
const PARCEL_TILES = [
  "https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}",
];
const HUMBOLDT_PARCEL_URL =
  "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0";

interface ParcelInfo {
  apn: string;
  address: string;
  acres: number;
  zoning: string;
  city: string;
}

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: "raster",
      tiles: SATELLITE_TILES,
      tileSize: 256,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
    reference: {
      type: "raster",
      tiles: REFERENCE_TILES,
      tileSize: 256,
      attribution: "© Esri",
    },
    parcels: {
      type: "raster",
      tiles: PARCEL_TILES,
      tileSize: 256,
      minzoom: 14,
      maxzoom: 18,
      attribution: "© Regrid",
    },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#25382e" } },
    { id: "satellite", type: "raster", source: "satellite" },
    {
      id: "reference",
      type: "raster",
      source: "reference",
      paint: { "raster-opacity": 0.92 },
    },
    {
      id: "parcels",
      type: "raster",
      source: "parcels",
      paint: { "raster-opacity": 0.82 },
    },
  ],
};

async function fetchParcelAt(lng: number, lat: number): Promise<ParcelInfo | null> {
  try {
    const url = `${HUMBOLDT_PARCEL_URL}/query?where=&geometry=${lng}%2C${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=APN_12,FULLADDR,SITCITY,ACRES,ZONING&returnGeometry=false&f=json`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as {
      features?: Array<{ attributes: Record<string, string | number | null> }>;
    };
    const attrs = data.features?.[0]?.attributes;
    if (!attrs) return null;

    return {
      apn: String(attrs.APN_12 ?? ""),
      address: String(attrs.FULLADDR ?? ""),
      city: String(attrs.SITCITY ?? ""),
      acres: Number.parseFloat(String(attrs.ACRES ?? "0")) || 0,
      zoning: String(attrs.ZONING ?? ""),
    };
  } catch {
    return null;
  }
}

export function LandingMap() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMapType | null>(null);
  const lookupSequence = useRef(0);
  const [raster, setRaster] = useState(false);
  const [loading, setLoading] = useState(true);
  const [parcelLoading, setParcelLoading] = useState(false);
  const [parcel, setParcel] = useState<ParcelInfo | null>(null);

  async function identifyParcel(lng: number, lat: number) {
    const sequence = ++lookupSequence.current;
    setParcelLoading(true);
    const info = await fetchParcelAt(lng, lat);
    if (sequence !== lookupSequence.current) return;
    setParcel(info);
    setParcelLoading(false);
  }

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    if (!supportsWebGL2()) {
      setRaster(true);
      setLoading(false);
      return;
    }

    const map = new MaplibreMap({
      container: container.current,
      style: MAP_STYLE,
      center: HUMBOLDT_CENTER,
      zoom: HUMBOLDT_ZOOM,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setLoading(false));
    map.on("click", (event) => {
      void identifyParcel(event.lngLat.lng, event.lngLat.lat);
    });
    map.on("mouseenter", () => {
      map.getCanvas().style.cursor = "crosshair";
    });

    mapRef.current = map;
    const fallback = window.setTimeout(() => setLoading(false), 3000);

    return () => {
      window.clearTimeout(fallback);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const rows: [string, string][] = parcel
    ? [
        ["APN", parcel.apn || "Not listed"],
        ["Zoning", parcel.zoning || "Not listed"],
        ["Acreage", parcel.acres ? `${parcel.acres.toFixed(2)} acres` : "Not listed"],
        ["Source", "Humboldt County GIS"],
      ]
    : [
        ["Map", "Live satellite"],
        ["Parcel lookup", "County GIS"],
        ["Parcel lines", "Zoom 14+"],
        ["Action", "Click any parcel"],
      ];

  return (
    <div className="relative h-[420px] w-full overflow-hidden md:h-[520px]">
      {raster ? (
        <RasterMap
          center={HUMBOLDT_CENTER}
          zoom={HUMBOLDT_ZOOM}
          tiles={SATELLITE_TILES[0]}
          parcels
          onClick={(point) => void identifyParcel(point[0], point[1])}
        />
      ) : (
        <div ref={container} className="h-full w-full" />
      )}

      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-forest/75 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-md bg-card/95 px-4 py-3 text-[13px] text-foreground shadow-lg">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-forest/25 border-t-forest" />
            Loading live map…
          </div>
        </div>
      )}

      <a
        href="/map"
        className="absolute left-4 right-16 top-4 z-10 flex items-center gap-2.5 rounded-md bg-card/95 px-4 py-3 shadow-md backdrop-blur-sm md:right-[36%]"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
          Search by address, APN, or case number...
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-forest" />
      </a>

      <div className="absolute bottom-4 right-4 z-10 hidden w-[260px] rounded-md bg-card/95 p-3 shadow-xl backdrop-blur-sm md:block">
        <img
          src={propertyThumb.src}
          alt="Humboldt County forest and river landscape"
          width={800}
          height={560}
          loading="lazy"
          className="h-[92px] w-full rounded-sm object-cover"
        />
        <div className="mt-3 flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-forest" />
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-foreground">
              {parcelLoading
                ? "Looking up parcel…"
                : parcel?.address || (parcel ? `Parcel ${parcel.apn}` : "Explore a parcel")}
            </h3>
            <p className="truncate text-[12px] text-muted-foreground">
              {parcel
                ? `${parcel.city || "Humboldt County"}, CA`
                : "Click anywhere on the live map"}
            </p>
          </div>
        </div>
        <dl className="mt-3 space-y-1.5 border-t border-border pt-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="max-w-[145px] truncate text-right text-[11px] font-medium text-foreground">
                {value}
              </dd>
            </div>
          ))}
        </dl>
        <a
          href="/map"
          className="mt-4 flex items-center justify-center gap-2 rounded-md bg-forest px-4 py-3 text-[12.5px] font-medium text-forest-foreground transition-opacity hover:opacity-90"
        >
          Open Full Interactive Map
          <ArrowRight className="h-3.5 w-3.5" />
        </a>
      </div>

      <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-md bg-forest/85 px-3 py-2 text-[11px] font-medium text-forest-foreground shadow-md backdrop-blur-sm md:bottom-5">
        Click the map for live parcel details
      </div>
    </div>
  );
}
