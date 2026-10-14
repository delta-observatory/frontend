# Delta Observatory frontend

The interactive frontend for Delta Observatory: React, Three.js through React Three Fiber, TypeScript, and Vite.
[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) records the agreed design. [DESIGN.md](../DESIGN.md) sets the requirements.

## Current scope

- Layout L2 shell: top bar, sky, movable rule, workbench, and inspector.
- Sky sphere in the equatorial frame with no site. North stays up. A drag turns the sky, and the wheel zooms.
- Stars to magnitude 8. Stars fainter than magnitude 6 fade in as the view zooms in.
- Constellation lines, an equatorial grid, the ecliptic, the galactic plane, and a drawn Milky Way model.
- Target markers from the API, coloured by display bins. A tooltip shows the values of a marker.
- Observation table over the sky. A row hover shows the marker of that row.
- Selection: a click on a marker or a row selects the target, and the sky turns to it. A crosshair and a label mark the selection.
- Search: free text, field filters (`snr`, `err`, `p`, `pref`, `tmag`, `sector`), and class buttons. The table lists the matches. Other markers become dim.
- All-sky map with every target and the outline of the view. A click on the map turns the view there.
- Keys: **/** search, **j** and **k** next and previous, **f** turn to the selection, **+** and **−** zoom.
- Motion setting in the top bar. "reduced" removes camera animation. The default follows the system setting.
- Performance display: catalogue load time, time to the first sky frame, frame time, and render CPU time.

- Workbench plots for the selected target, with WebGL data layers:
  - Light curve: prepared flux, fitted trend, predicted event times, and excluded rows. A drag selects a time range.
  - Periodogram: BLS power on a log period axis, stored peaks, aliases, and the reference period. A click on a peak sets a display period.
  - Phase fold: points, binned means with standard errors, and the BLS box model. A display fold has no box model and says that it is not a stored result.
  - **Esc** clears the time range and the display period.
- Inspector: the method status from the API, target values, search and reference-comparison measurements with units, uncertainty, and flags, input checks, provenance, and load times.

Run comparison, parameter controls, and new runs are not implemented.

## Development

```bash
npm ci
npm run dev        # http://<host>:5173 on the LAN
npm test
npm run build      # type check and production build in dist/
```

The development server binds to `0.0.0.0:5173`.
It sends `/api` to `http://10.0.0.47:30870`. Set `DELTA_API_URL` to use another API.
The address hash sets the first view, for example `#ra=266.4&dec=-28.9&fov=100`.
Vite accepts IP addresses and the host names `machine` and `machine.local`. It blocks other host names.

The sky view needs WebGL 2. Without it, the sky area shows the browser's reason, and the other panels still work.
Chromium started with `--disable-gpu` has no WebGL.

`.npmrc` sets exact versions. npm 10.9.8 fails to add `vitest` with the error `Cannot read properties of null (reading 'edgesOut')`.
To add or change `vitest`, run `npm install -D vitest@<version> --legacy-peer-deps`. `npm ci` works without the flag.

## API use

The frontend reads only these endpoints:

| Endpoint | Use |
|---|---|
| `GET /api/health` | API state in the top bar. |
| `GET /api/datasets` | Dataset name and ready count. |
| `GET /api/observations` | Observation list. |
| `GET /api/observations/{id}` | Sky position (`RA_OBJ`, `DEC_OBJ`) and `TESSMAG` from the header. The list has no sky position. |
| `GET /api/runs` | The newest `tess-bls` run with complete jobs. |
| `GET /api/runs/{id}/results` | Measurements, artifacts, diagnostics, software, and resources of each job. |
| `GET /api/methods/{id}/{version}` | Scientific status of the method. |
| `GET /api/artifacts/{id}/content` | Light curve, prepared series, periodogram, search summary, and input checks of the selected target. |

`src/api/types.ts` lists only the response fields that the frontend reads.
The backend owns these responses. The measurement fields follow `database/contracts/result/v1.schema.json`.

## Sky data

`public/sky/` holds display assets. [public/sky/SOURCE.md](public/sky/SOURCE.md) gives their source and checksums.
`npm run sky-data -- <directory>` writes them again from the source files.

## Layout

| Path | Content |
|---|---|
| `src/App.tsx` | Layout shell, data loading, and the movable rule. |
| `src/Catalogue.tsx` | Observation table and search controls. |
| `src/Inspector.tsx` | Measurements, checks, and provenance of the selected target. |
| `src/motion.ts` | Motion setting. |
| `src/api/` | HTTP access and response types. |
| `src/data/catalogue.ts` | Target list, sky positions, run measurements, and display bins. |
| `src/data/search.ts` | Search parser. `search.test.ts` tests it. |
| `src/data/evidence.ts` | Artifact loading for one result, with a cache of 12 results. |
| `src/plots/surface.ts` | Plot layers: 2D axes, WebGL data, 2D marks. |
| `src/plots/fold.ts` | Phase fold and bins. `fold.test.ts` tests it. |
| `src/plots/LightCurve.tsx`, `Periodogram.tsx`, `Fold.tsx` | The three workbench plots. |
| `src/sky/math.ts` | Sky geometry and the stereographic projection. `math.test.ts` tests it. |
| `src/sky/camera.ts` | View state: view center, north-up basis, field of view, and camera turns. |
| `src/sky/shaders.ts` | GLSL for the projection and each sky layer. |
| `src/sky/layers.tsx` | Grid, constellation lines, stars, targets, and the Milky Way. |
| `src/sky/SkyView.tsx` | Canvas, input, tooltip, selection mark, and the sky display. |
| `src/sky/AllSky.tsx` | All-sky map. |
| `src/perf/frames.ts` | Frame time measurement. |
| `src/theme.ts` | Colour tokens for WebGL and CSS. |
