"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, type Map as MaplibreMapType } from "maplibre-gl";
import { Maximize2, X } from "lucide-react";

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

// Small, non-interactive-by-default preview of the parcel. Same tile sources
// as PropertyMap so it stays visually consistent; click to expand into the
// full interactive map rather than rendering a static image.
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
    <div className="absolute top-3 right-3 z-20 w-56 h-40 rounded-xl overflow-hidden glass shadow-lg">
      <div ref={container} className="w-full h-full" />

      <div className="absolute top-1.5 left-1.5 flex gap-1">
        {(["satellite", "street"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-1.5 py-0.5 text-[10px] rounded capitalize ${
              view === v ? "bg-fp-blue/40 text-fp-text" : "bg-fp-bg/60 text-fp-text-dim"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      <button
        onClick={onExpand}
        className="absolute top-1.5 right-1.5 p-1 rounded bg-fp-bg/60 text-fp-text-dim hover:text-fp-text"
        title="Expand map"
      >
        <Maximize2 className="w-3 h-3" />
      </button>
    </div>
  );
}
