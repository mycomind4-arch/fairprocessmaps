"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, type Map as MaplibreMapType } from "maplibre-gl";
import { Maximize2 } from "lucide-react";

interface MiniMapProps {
  centroid: { lng: number; lat: number };
  geomGeoJSON?: any | null;
  onExpand?: () => void;
}

const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
const STREET_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
];

export default function MiniMap({ centroid, geomGeoJSON, onExpand }: MiniMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMapType | null>(null);
  const [view, setView] = useState<"satellite" | "street">("satellite");

  useEffect(() => {
    if (!container.current || mapRef.current) return;

    const tiles = view === "satellite" ? SATELLITE_TILES : STREET_TILES;
    const map = new MaplibreMap({
      container: container.current,
      style: {
        version: 8,
        sources: { base: { type: "raster", tiles, tileSize: 256 } },
        layers: [{ id: "base", type: "raster", source: "base" }],
      },
      center: [centroid.lng, centroid.lat],
      zoom: 17,
      interactive: false,
      attributionControl: false,
    });

    map.on("load", () => {
      if (!geomGeoJSON) return;
      map.addSource("parcel-outline", { type: "geojson", data: geomGeoJSON as any });
      map.addLayer({
        id: "parcel-outline",
        type: "line",
        source: "parcel-outline",
        paint: { "line-color": "#fbbf24", "line-width": 2 },
      });
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return (
    <div className="absolute top-4 right-4 z-20 w-64 h-44 rounded-[14px] overflow-hidden glass shadow-lg shadow-black/20 border border-fp-border">
      <div ref={container} className="w-full h-full" />

      <div className="absolute top-2 left-2 flex gap-1">
        {(["satellite", "street"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-2 py-1 text-xs rounded-md capitalize font-medium transition-colors ${
              view === v ? "bg-fp-blue text-white" : "bg-fp-bg/80 text-fp-text-dim hover:text-fp-text"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={onExpand}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-fp-bg/80 text-fp-text-dim hover:text-fp-text transition-colors"
        title="Expand map"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
