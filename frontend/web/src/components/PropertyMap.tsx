"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface PropertyMapProps {
  onSelectProperty: (id: string | null) => void;
  selectedProperty: string | null;
}

// Custom dark map style for the FairProcess theme
const DARK_MAP_STYLE = {
  version: 8,
  glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
  sources: {
    "osm-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#070b14" },
    },
    {
      id: "osm-dark-tiles",
      type: "raster",
      source: "osm-dark",
      paint: {
        "raster-opacity": 0.85,
        "raster-saturation": -0.3,
        "raster-contrast": 0.1,
      },
    },
  ],
};

export default function PropertyMap({ onSelectProperty, selectedProperty }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: (process.env.NEXT_PUBLIC_MAPLIBRE_STYLE
        ? JSON.parse(process.env.NEXT_PUBLIC_MAPLIBRE_STYLE)
        : DARK_MAP_STYLE) as maplibregl.StyleSpecification,
      center: [-122.27, 37.8],
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }));

    map.on("load", () => {
      map.addSource("properties", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      // Fill layer with glow
      map.addLayer({
        id: "property-fill",
        type: "fill",
        source: "properties",
        paint: {
          "fill-color": [
            "match",
            ["get", "score"],
            [null], "#3b82f6",
            "#3b82f6",
          ],
          "fill-opacity": 0.25,
        },
      });

      // Glow outline
      map.addLayer({
        id: "property-glow",
        type: "line",
        source: "properties",
        paint: {
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-blur": 4,
          "line-opacity": 0.6,
        },
        layout: { "line-cap": "round" },
      });

      // Crisp outline
      map.addLayer({
        id: "property-outline",
        type: "line",
        source: "properties",
        paint: {
          "line-color": "#06b6d4",
          "line-width": 1.5,
          "line-opacity": 0.8,
        },
      });

      map.on("click", "property-fill", (e) => {
        const feature = e.features?.[0];
        if (feature?.properties?.id) {
          onSelectProperty(feature.properties.id);
        }
      });

      map.on("mouseenter", "property-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "property-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    mapRef.current = map;

    fetch("/api/v1/properties?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setProperties(data);
        const features = data
          .filter((p: any) => p.geom)
          .map((p: any) => ({
            type: "Feature",
            properties: { id: p.id, address: p.address, score: p.due_process_score ?? null },
            geometry: p.geom,
          }));
        const source = map.getSource("properties") as maplibregl.GeoJSONSource;
        source?.setData({ type: "FeatureCollection", features });
      })
      .catch(() => {});

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [onSelectProperty]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedProperty) return;
    const prop = properties.find((p) => p.id === selectedProperty);
    if (prop?.centroid) {
      map.flyTo({
        center: [prop.centroid.coordinates[0], prop.centroid.coordinates[1]],
        zoom: 16,
        duration: 1200,
        essential: true,
      });
    }
  }, [selectedProperty, properties]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
