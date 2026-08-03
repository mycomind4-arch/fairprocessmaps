"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface PropertyMapProps {
  onSelectProperty: (id: string | null) => void;
  selectedProperty: string | null;
}

export default function PropertyMap({ onSelectProperty, selectedProperty }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [properties, setProperties] = useState<any[]>([]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: process.env.NEXT_PUBLIC_MAPLIBRE_STYLE || "https://demotiles.maplibre.org/style.json",
      center: [-122.27, 37.8], // Oakland, CA
      zoom: 12,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true } }));

    map.on("load", () => {
      // Add property parcels layer
      map.addSource("properties", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: "property-fill",
        type: "fill",
        source: "properties",
        paint: {
          "fill-color": "#2563eb",
          "fill-opacity": 0.3,
        },
      });

      map.addLayer({
        id: "property-outline",
        type: "line",
        source: "properties",
        paint: {
          "line-color": "#2563eb",
          "line-width": 1.5,
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

    // Fetch sample properties
    fetch("/api/v1/properties?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setProperties(data);
        const features = data
          .filter((p: any) => p.geom)
          .map((p: any) => ({
            type: "Feature",
            properties: { id: p.id, address: p.address },
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

  // Highlight selected property
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedProperty) return;

    const prop = properties.find((p) => p.id === selectedProperty);
    if (prop?.centroid) {
      map.flyTo({
        center: [prop.centroid.coordinates[0], prop.centroid.coordinates[1]],
        zoom: 16,
        duration: 800,
      });
    }
  }, [selectedProperty, properties]);

  return <div ref={mapContainer} className="w-full h-full" />;
}
