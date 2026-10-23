/** Request the software Canvas 2D path. No WebGL context is required. */
export function context2d(canvas: HTMLCanvasElement, alpha = true): CanvasRenderingContext2D {
  const context = canvas.getContext("2d", { alpha, willReadFrequently: true });
  if (!context) throw new Error("The browser could not create a Canvas 2D context.");
  return context;
}

/** Bound backing-store work on high-density screens. Coordinates remain CSS pixels. */
export const canvasDpr = () => Math.min(2, globalThis.devicePixelRatio || 1);
