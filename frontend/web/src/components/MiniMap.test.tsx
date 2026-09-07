// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import MiniMap from "./MiniMap";

const constructMap = vi.hoisted(() => vi.fn(() => { throw new Error("WebGL unavailable"); }));
vi.mock("maplibre-gl", () => ({ Map: constructMap }));
vi.mock("./RasterMap", () => ({ default: () => React.createElement("div", { "data-testid": "raster-map" }) }));

it("renders a map without WebGL and can unmount when the user switches menus", async () => {
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const context = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<MiniMap centroid={{ lng: -124.15, lat: 40.81 }} />));
    expect(container.querySelector('[data-testid="raster-map"]')).not.toBeNull();
    expect(constructMap).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  } finally {
    context.mockRestore();
    container.remove();
    vi.unstubAllGlobals();
  }
});
