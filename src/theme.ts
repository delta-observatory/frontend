// Colour tokens for direction A. main.tsx copies them into CSS custom properties,
// so canvas layers and HTML use the same values.

export const colors = {
  bg: "#03050a",
  panel: "rgba(4,6,11,.92)",
  rule: "#1e2733",
  ruleSoft: "#121922",
  text: "#d3dae3",
  textStrong: "#ffffff",
  dim: "#6d7989",
  selBg: "#0f1824",
  // Observations, models, and references keep separate colours in every view.
  obs: "#dfe6ee",
  model: "#f0a640",
  ref: "#5fb4ff",
  flag: "#c98a8a",
  // Display bins for target markers. They are not a validation criterion.
  stMatch: "#8fd6b0",
  stNear: "#e3cf7a",
  stMiss: "#ff6b5a",
  stSignal: "#c58cff",
  stEb: "#8794a6",
  stQuiet: "#4d5866",
} as const;

export const sky = {
  grid: [120, 150, 190, 0.11],
  gridEquator: [120, 150, 190, 0.24],
  constellation: [140, 170, 215, 0.22],
  ecliptic: [240, 166, 64, 0.32],
  galactic: [197, 140, 255, 0.3],
  milkyWay: [150, 170, 215],
  milkyWayAlpha: 0.32,
} as const;

export function applyCssTokens(root: HTMLElement) {
  for (const [k, v] of Object.entries(colors)) root.style.setProperty(`--${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())}`, v);
}
