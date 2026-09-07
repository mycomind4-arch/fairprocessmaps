"use client";

import { useEffect, useRef } from "react";
import type { GeoJsonObject } from "geojson";
import type { Map } from "leaflet";
import "leaflet/dist/leaflet.css";

interface Props {
  center: [number, number];
  zoom: number;
  tiles: string;
  interactive?: boolean;
  geometry?: GeoJsonObject;
  parcels?: boolean;
  onClick?: (point: [number, number]) => void;
}

export default function RasterMap({ center, zoom, tiles, interactive = true, geometry, parcels, onClick }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onClick);
  clickRef.current = onClick;

  useEffect(() => {
    let disposed = false;
    let map: Map | undefined;
    let observer: ResizeObserver | undefined;
    void import("leaflet").then((L) => {
      if (disposed || !container.current) return;
      map = L.map(container.current, {
        center: [center[1], center[0]], zoom,
        zoomControl: false, dragging: interactive, scrollWheelZoom: interactive,
        doubleClickZoom: interactive, touchZoom: interactive, boxZoom: interactive, keyboard: interactive,
      });
      L.tileLayer(tiles, { maxZoom: 20, attribution: tiles.includes("arcgisonline") ? "© Esri" : "© OpenStreetMap © CARTO" }).addTo(map);
      if (parcels) L.tileLayer("https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}", { minZoom: 14, maxNativeZoom: 18, maxZoom: 20, attribution: "© Regrid" }).addTo(map);
      if (geometry) L.geoJSON(geometry, { style: { color: "#fbbf24", weight: 2, fillOpacity: 0.1 } }).addTo(map);
      if (interactive) L.control.zoom({ position: "topright" }).addTo(map);
      map.on("click", (event) => clickRef.current?.([event.latlng.lng, event.latlng.lat]));
      observer = new ResizeObserver(() => map?.invalidateSize());
      observer.observe(container.current);
    });
    return () => { disposed = true; observer?.disconnect(); map?.remove(); };
  }, [center[0], center[1], zoom, tiles, interactive, geometry, parcels]);

  return <div ref={container} className="w-full h-full relative z-0" aria-label="Map" />;
}
