# Frontend design decisions

This file records the agreed design decisions for the Delta Observatory frontend.
Richard directs the visual style and the interaction design.
[DESIGN.md](../DESIGN.md) sets the frontend requirements. This file records the choices inside those requirements.
No frontend code exists.

## Agreed

| Item | Decision |
|---|---|
| Theme | Dark only. The night sky sets the base of the interface. |
| Sky view | The interface shows a star field on a dome. Observations, results, and tests show as overlays on the sky. |
| Shape | Sharp corners on all panels, controls, and markers that have a box shape. |
| Density | A precise and dense layout. |
| Character | Technical and restrained. The interface must not look like a generic web application template. |
| Numbers | Monospace type with tabular figures for all numbers. |
| 3D views | Four views: a sky map of the targets, a period–duration–power surface, a phase-fold animation, and an orbit view. |
| Orbit view | The data has no distance or stellar mass. The orbit view labels each inferred value and each assumption. |
| First workflow | Free search of observations, then tests on the selected observations. |
| First vertical | Inspection of one target inside the sky view. A run with changed parameters follows. Survey views reuse the standards that this step sets. |

The first vertical starts with target inspection for these reasons:

- It needs every element that later screens reuse: plots, measurement tables, units, uncertainty, flags, and the scientific status.
- It sets the visual difference between observations and predictions before other screens depend on it.
- The run and survey workflows use the same components with more records.

## Requirements from DESIGN.md

- Observations and predictions look different. Uncertainty stays visible.
- Units, quality flags, and the provisional scientific status show next to each result.
- Display normalization does not change scientific values.
- The interface has reduced-motion controls and usable static views.

## Open

| Item | Required decision |
|---|---|
| Visual direction | A choice between the planetarium, red-light control room, and star atlas mockups, or a mix of their parts. |
| Review hardware | Computer, graphics card, browser, screen size, resolution, and number of monitors. |
| Performance targets | Load time, frame rate, interaction latency, and browser memory. |
| Tools | DESIGN.md requires React and Three.js. React Three Fiber, TypeScript, and Vite need confirmation. |
| API access in development | A Vite proxy, or a CORS origin in `kubernetes/base/kustomization.yaml`. |
| Dome site and time | A fixed observer site and time, the current time, or a celestial sphere with no site. |
| Star catalog | The source and magnitude limit of the background stars. |
