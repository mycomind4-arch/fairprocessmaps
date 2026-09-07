import { describe, expect, it, vi } from "vitest";
import { supportsWebGL2 } from "./map-support";

describe("map graphics fallback", () => {
  it("uses the raster fallback when the browser cannot create WebGL2", () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    expect(supportsWebGL2()).toBe(false);
    vi.unstubAllGlobals();
  });
  it("releases the probe context on supported browsers", () => {
    const loseContext = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ getExtension: () => ({ loseContext }) }) }) });
    expect(supportsWebGL2()).toBe(true);
    expect(loseContext).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
