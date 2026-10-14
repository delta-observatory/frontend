/** Checks for a WebGL 2 context before the sky starts. Returns the browser's reason when there is none. */
export function webgl2Status(): { ok: true } | { ok: false; reason: string } {
  const canvas = document.createElement("canvas");
  let reason = "";
  canvas.addEventListener("webglcontextcreationerror", (e) => { reason = (e as WebGLContextEvent).statusMessage; }, { once: true });
  const gl = canvas.getContext("webgl2");
  if (gl) {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return { ok: true };
  }
  return { ok: false, reason: reason || "The browser returned no WebGL 2 context." };
}
