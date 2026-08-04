"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Map as MaplibreMap, NavigationControl, GeolocateControl, ScaleControl, Popup, type Map as MaplibreMapType, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

interface PropertyMapProps {
  onSelectProperty: (id: string | null) => void;
  selectedProperty: string | null;
  onOpenAsProject?: (info: ParcelInfo, lngLat: [number, number]) => void;
}

type BaseLayer = "satellite" | "street" | "dark";

// ── Humboldt County center ──
const HUMBOLDT_CENTER: [number, number] = [-124.15, 40.81];
const HUMBOLDT_ZOOM = 11;

// ── Tile sources ──
const SATELLITE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];
const REFERENCE_TILES = [
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
];
const STREET_TILES = [
  "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
  "https://d.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
];
const DARK_TILES = [
  "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
  "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
];

// Regrid nationwide parcel boundaries (zoom 15-17)
const PARCEL_TILES = [
  "https://tiles.arcgis.com/tiles/KzeiCaQsMoeCfoCq/arcgis/rest/services/Regrid_Nationwide_Parcel_Boundaries_v1/MapServer/tile/{z}/{y}/{x}",
];

// Humboldt County GIS — parcel feature layer for click-to-identify
const HUMBOLDT_PARCEL_URL =
  "https://cty-gis-web.co.humboldt.ca.us/server/rest/services/Parcels/Parcels/MapServer/0";

interface ParcelInfo {
  apn: string;
  address: string;
  acres: number;
  zoning: string;
  city: string;
  legal: string;
}

async function fetchParcelAt(lng: number, lat: number): Promise<ParcelInfo | null> {
  try {
    const url = `${HUMBOLDT_PARCEL_URL}/query?where=&geometry=${lng}%2C${lat}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=APN_12,FULLADDR,SITCITY,ACRES,ZONING,GEN_PLAN&returnGeometry=false&f=json`;
    const res = await fetch(url);
    const data = await res.json() as { features?: Array<{ attributes: Record<string, string | number | null> }> };
    if (!data.features?.length) return null;
    const attrs = data.features[0].attributes as Record<string, string>;
    return {
      apn: attrs.APN_12 || "",
      address: attrs.FULLADDR || "",
      acres: parseFloat(attrs.ACRES) || 0,
      zoning: attrs.ZONING || "",
      city: attrs.SITCITY || "",
      legal: attrs.GEN_PLAN || "",
    };
  } catch {
    return null;
  }
}

// ── Property overlay layer definitions ──
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
    layout: { "line-cap": "round" as const },
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
    layout: { "line-cap": "round" as const },
  },
];

function buildStyle(layer: BaseLayer): StyleSpecification {
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
        satellite: { type: "raster", tiles: SATELLITE_TILES, tileSize: 256, attribution: "© Esri, Maxar, Earthstar Geographics" },
        reference: { type: "raster", tiles: REFERENCE_TILES, tileSize: 256, attribution: "© Esri" },
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
        street: { type: "raster", tiles: STREET_TILES, tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" },
        parcels: parcelSource,
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#f8f9fa" } },
        { id: "street-tiles", type: "raster", source: "street" },
        { id: "parcel-tiles", type: "raster", source: "parcels", paint: { "raster-opacity": 0.8 } },
      ],
    };
  }

  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      dark: { type: "raster", tiles: DARK_TILES, tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" },
      parcels: parcelSource,
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#070b14" } },
      { id: "dark-tiles", type: "raster", source: "dark", paint: { "raster-opacity": 0.9 } },
      { id: "parcel-tiles", type: "raster", source: "parcels", paint: { "raster-opacity": 0.6 } },
    ],
  };
}

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

function loadPropertyData(map: MaplibreMapType, properties: any[]) {
  const features = properties
    .filter((p: any) => p.geom)
    .map((p: any) => ({
      type: "Feature" as const,
      properties: { id: p.id, address: p.address, score: p.due_process_score ?? null },
      geometry: p.geom,
    }));
  const source = map.getSource("properties") as GeoJSONSource;
  source?.setData({ type: "FeatureCollection", features });
}

export default function PropertyMap({ onSelectProperty, selectedProperty, onOpenAsProject }: PropertyMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMapType | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [properties, setProperties] = useState<any[]>([]);
  const [baseLayer, setBaseLayer] = useState<BaseLayer>("satellite");
  const [showParcels, setShowParcels] = useState(true);
  const [parcelInfo, setParcelInfo] = useState<ParcelInfo | null>(null);
  const [loadingParcel, setLoadingParcel] = useState(false);
  const isFirstRender = useRef(true);
  const onOpenAsProjectRef = useRef(onOpenAsProject);
  onOpenAsProjectRef.current = onOpenAsProject;

  // ── Init map ──
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new MaplibreMap({
      container: mapContainer.current,
      style: buildStyle("satellite"),
      center: HUMBOLDT_CENTER,
      zoom: HUMBOLDT_ZOOM,
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

      // Click on a tracked property
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

      // Click anywhere on the map → identify Humboldt County parcel
      map.on("click", async (e) => {
        const features = map.queryRenderedFeatures(e.point, { layers: ["property-fill"] });
        if (features.length > 0) return; // let the property-fill handler take it

        setLoadingParcel(true);
        setParcelInfo(null);

        const { lng, lat } = e.lngLat;
        const info = await fetchParcelAt(lng, lat);

        setLoadingParcel(false);

        if (info) {
          setParcelInfo(info);
          // Show popup with parcel details
          const html = `
            <div style="padding:8px 4px;font-family:inherit;min-width:180px">
              <div style="font-size:13px;font-weight:600;color:#06b6d4;margin-bottom:4px">${info.address || "No address"}</div>
              <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${info.city || "Humboldt County"}, CA</div>
              <div style="display:flex;flex-direction:column;gap:2px;font-size:11px;color:#cbd5e1">
                <div><span style="color:#64748b">APN:</span> ${info.apn || "—"}</div>
                <div><span style="color:#64748b">Zoning:</span> ${info.zoning || "—"}</div>
                <div><span style="color:#64748b">Acres:</span> ${info.acres ? info.acres.toFixed(2) : "—"}</div>
                <div><span style="color:#64748b">Legal:</span> ${info.legal ? info.legal.substring(0, 60) : "—"}</div>
              </div>
              <button id="open-project-btn" style="margin-top:8px;width:100%;padding:6px;background:#3b82f6;color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">
                Open as project
              </button>
            </div>
          `;
          if (popupRef.current) popupRef.current.remove();
          popupRef.current = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "280px" })
            .setLngLat([lng, lat])
            .setHTML(html)
            .addTo(map);

          // Wire the button after it's in the DOM — setHTML() replaces the
          // popup's content each time, so this listener is attached fresh
          // per popup rather than relying on delegation.
          const btn = popupRef.current.getElement()?.querySelector("#open-project-btn");
          btn?.addEventListener("click", () => {
            onOpenAsProjectRef.current?.(info, [lng, lat]);
            popupRef.current?.remove();
          });
        }
      });
    });

    mapRef.current = map;

    // Fetch property data
    fetch("/api/v1/properties?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const arr = data as any[];
        setProperties(arr);
        loadPropertyData(map, arr);
      })
      .catch(() => {});

    return () => {
      if (popupRef.current) popupRef.current.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSelectProperty]);

  // ── Switch base layer ──
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
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
        {(["satellite", "street", "dark"] as BaseLayer[]).map((layer) => (
          <button
            key={layer}
            onClick={() => setBaseLayer(layer)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-md border transition-all capitalize ${
              baseLayer === layer
                ? "bg-cyan-500/30 border-cyan-400/50 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.3)]"
                : "bg-slate-900/60 border-slate-700/50 text-slate-300 hover:bg-slate-800/60"
            }`}
          >
            {layer}
          </button>
        ))}
        <button
          onClick={() => setShowParcels(!showParcels)}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-md border transition-all mt-1 ${
            showParcels
              ? "bg-blue-500/30 border-blue-400/50 text-blue-100 shadow-[0_0_12px_rgba(59,130,246,0.3)]"
              : "bg-slate-900/60 border-slate-700/50 text-slate-300 hover:bg-slate-800/60"
          }`}
        >
          Parcel Lines
        </button>
      </div>

      {/* Loading indicator for parcel lookup */}
      {loadingParcel && (
        <div className="absolute top-3 right-16 z-10 bg-slate-900/80 backdrop-blur-md border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 animate-pulse">
          Looking up parcel…
        </div>
      )}
    </div>
  );
}
