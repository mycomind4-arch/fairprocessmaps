// Probe before constructing MapLibre: a failed constructor can leave an object
// whose controls and remove() crash the surrounding React page.
export function supportsWebGL2(): boolean {
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
