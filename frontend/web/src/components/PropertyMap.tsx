"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MaplibreMap, NavigationControl, GeolocateControl, ScaleControl, type Map as MaplibreMapType, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface PropertyMapProps {
  onSelectProperty: (id: string | null) => void;
  selectedProperty: string | null;
}

type BaseLayer = "satellite" | "street" | "dark";

// ── Tile sources ──
// Esri World Imagery (free, no API key) — high-res satellite worldwide
const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

// Esri reference overlay (boundaries, place names, roads on top of satellite)
const REFERENCE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
];

// CARTO Voyager — clean street map with labels
const STREET_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
];

// CARTO Dark Matter — dark theme street map
const DARK_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
];

// Regrid nationwide parcel boundaries (free Esri tile layer, zoom 15-17)
const PARCEL_TILES = [
  "https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}",
];

// ── Layer definitions for property GeoJSON overlay ──
const PROPERTY_LAYERS = [
  {
    id: "property-fill",
    type: "fill" as const,
    source: "properties",
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "score"], null], "#3b82f6",
        [">=", ["get", "score"], 80], "#22c55e",
        [">=", ["get", "score"], 60], "#eab308",
        [">=", ["get", "score"], 40], "#f97316",
        "#ef4444",
      ],
      "fill-opacity": 0.35,
    },
  },
  {
    id: "property-glow",
    type: "line" as const,
    source: "properties",
    paint: { "line-color": "#3b82f6", "line-width": 3, "line-blur": 6, "line-opacity": 0.5 },
    layout: { "line-cap": "round" },
  },
  {
    id: "property-outline",
    type: "line" as const,
    source: "properties",
    paint: { "line-color": "#06b6d4", "line-width": 1.5, "line-opacity": 0.9 },
  },
  {
    id: "property-selected",
    type: "line" as const,
    source: "properties",
    filter: ["==", ["get", "id"], ""],
    paint: { "line-color": "#fbbf24", "line-width": 3, "line-opacity": 1 },
    layout: { "line-cap": "round" },
  },
];

function buildStyle(layer: BaseLayer): StyleSpecification {
  // All styles include the parcel overlay source
  const parcelSource = {
    type: "raster" as const,
    tiles: PARCEL_TILES,
    tileSize: 256,
    minzoom: 15,
    maxzoom: 18,
    attribution: "© Regrid",
  };

  if (layer === "satellite") {
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
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
        parcels: parcelSource,
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#070b14" } },
        { id: "satellite-tiles", type: "raster", source: "satellite" },
        { id: "reference-tiles", type: "raster", source: "reference", paint: { "raster-opacity": 0.9 } },
        { id: "parcel-tiles", type: "raster", source: "parcels", paint: { "raster-opacity": 0.8 } },
      ],
    };
  }

  if (layer === "street") {
    return {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        street: {
          type: "raster",
          tiles: STREET_TILES,
          tileSize: 256,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
        parcels: parcelSource,
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f8f9fa" } },
        { id: "street-tiles", type: "raster", source: "street" },
        { id: "parcel-tiles", type: "raster", source: "parcels", paint: { "raster-opacity": 0.8 } },
      ],
    };
  }

  // dark
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      dark: {
        type: "raster",
        tiles: DARK_TILES,
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
      parcels: parcelSource,
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#070b14" } },
      { id: "dark-tiles", type: "raster", source: "dark", paint: { "raster-opacity": 0.9 } },
      { id: "parcel-tiles", type: "raster", source: "parcels", paint: { "raster-opacity": 0.6 } },
    ],
  };
}

// Helper: add all property GeoJSON layers to current map
function addPropertyLayers(map: MaplibreMapType, selectedId: string | null) {
  if (!map.getSource("properties")) {
    map.addSource("properties", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  for (const layerDef of PROPERTY_LAYERS) {
    if (map.getLayer(layerDef.id)) continue;
    const config: any = { ...layerDef };
    if (layerDef.id === "property-selected") {
      config.filter = ["==", ["get", "id"], selectedId ?? ""];
    }
    map.addLayer(config);
  }
}

// Helper: load property GeoJSON data into the source
function loadPropertyData(map: MaplibreMapType, properties: any[]) {
  const features = properties
    .filter((p: any) => p.geom)
    .map((p: any) => ({
      type: "Feature",
      properties: { id: p.id, address: p.address, score: p.due_process_score ?? null },
      geometry: p.geom,
    }));
  const source = map.getSource("properties") as GeoJSONSource;
  source?.setData({ type: "FeatureCollection", features });
}

export default function PropertyMap({ onSelectProperty, selectedProperty }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMapType | null>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [showParcels, setShowParcels] = useState(true);

  // ── Init map ──
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MaplibreMap({
      container: mapContainer.current,
      style: buildStyle("satellite"),
      center: [-122.27, 37.8],
      zoom: 12,
      attributionControl: { compact: true },
    });

    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new ScaleControl({ unit: "imperial" }), "bottom-left");
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true } }),
      "top-right"
    );

    map.on("load", () => {
      addPropertyLayers(map, selectedProperty);

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

    // Fetch property data
    fetch("/api/v1/properties?limit=100")
      .then((r) => r.json())
      .then((data) => {
        setProperties(data);
        loadPropertyData(map, data);
      })
      .catch(() => {});

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelectProperty]);

  // ── Switch base layer ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(buildStyle(baseLayer));
    map.once("style.load", () => {
      addPropertyLayers(map, selectedProperty);
      loadPropertyData(map, properties);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseLayer]);

  // ── Toggle parcel overlay ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = map.getLayer("parcel-tiles");
    if (layer) {
      map.setLayoutProperty("parcel-tiles", "visibility", showParcels ? "visible" : "none");
    }
  }, [showParcels, baseLayer]);

  // ── Fly to selected property ──
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

  // ── Update selected filter ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer("property-selected")) {
      map.setFilter("property-selected", ["==", ["get", "id"], selectedProperty ?? ""]);
    }
  }, [selectedProperty]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Layer switcher */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <div className="flex gap-1 bg-fp-surface/90 backdrop-blur-md rounded-lg border border-fp-border p-1 shadow-lg">
          {(["satellite", "street", "dark"] as BaseLayer[]).map((layer) => (
            <button
              key={layer}
              onClick={() => setBaseLayer(layer)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${
                baseLayer === layer
                  ? "bg-fp-blue text-white shadow-sm"
                  : "text-fp-text-muted hover:text-fp-text hover:bg-fp-surface-2"
              }`}
            >
              {layer}
            </button>
          ))}
        </div>

        {/* Parcel toggle */}
        <button
          onClick={() => setShowParcels(!showParcels)}
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border shadow-lg transition-all backdrop-blur-md ${
            showParcels
              ? "bg-fp-surface/90 border-fp-blue/50 text-fp-text"
              : "bg-fp-surface/90 border-fp-border text-fp-text-muted hover:text-fp-text"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${showParcels ? "bg-fp-blue" : "bg-fp-text-dim"}`}
          />
          Parcel Lines
        </button>
      </div>
    </div>
  );
}
