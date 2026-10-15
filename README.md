# Delta Observatory frontend

The interactive frontend for Delta Observatory: React, Three.js through React Three Fiber, TypeScript, and Vite.
[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) records the agreed design. [DESIGN.md](../DESIGN.md) sets the requirements.

## Current scope

- Layout L2 shell: top bar, sky, movable rule, workbench, and inspector.
- Compact layout for phones and narrow windows: the sky on top, a selection strip with previous and next buttons, and tabs.
  The tabs are Targets, Curve, Periodogram, Fold, Details, and Run. Touch: one finger turns the sky, two fingers zoom, and a tap selects.
- Sky sphere in the equatorial frame with no site. North stays up. A drag turns the sky, and the wheel zooms.
- Stars to magnitude 8. Stars fainter than magnitude 6 fade in as the view zooms in.
- Constellation lines, an equatorial grid, the ecliptic, the galactic plane, and a drawn Milky Way model.
- Target markers from the API, coloured by display bins. A tooltip shows the values of a marker.
- Observation table over the sky. A row hover shows the marker of that row.
- Selection: a click on a marker or a row selects the target, and the sky turns to it. A crosshair and a label mark the selection.
- Search: the API grammar `target-query/1` with free text, field filters (`snr`, `err`, `p`, `pref`, `tmag`, `sector`), and class buttons. The table lists the matches in the API order. Other markers become dim.
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

- Target changes: during a load, the plots keep the previous result, dim and labelled. The app loads a target in advance when the pointer rests on its marker or row. It also loads the next and previous rows after each selection.

- Run panel (the Run tab, or the run name in the top bar):
  - A parameter form built from the method's parameter schema, with units, defaults, limits, and the cross-field rules. An amber mark shows each changed value. The API checks the request again, and its 422 errors show at the fields.
  - Inputs: the selected target, or all search matches.
  - The estimate from `POST /api/runs/estimate`: BLS trial periods for each light curve, and worker time from the median rate of measured jobs. The same request gives the authoritative parameter check.
  - The run list with job states, changed parameters, a job table, and a button that cancels queued jobs.
  - "Show results" selects the run that the sky, plots, and measurements show. The browser remembers the choice. Without a choice, the API rule `default-run/1` selects the run.

Run comparison is not implemented.

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

## Image and deployment

The `Dockerfile` builds the app with Node 22 and serves `dist/` with unprivileged nginx on port 8080.
`deploy/nginx.conf` sends `/api/` to the `delta-api` Service and answers `/healthz`.
`kubernetes/scripts/build.sh frontend` builds the image in the cluster. [kubernetes/README.md](../kubernetes/README.md) describes the release.
The deployed app is at `http://10.0.0.47:30871/` on the LAN.

## API use

Research agents use the same API. Each value that the frontend shows comes from an API response, and each rule that it applies is an API rule.
`GET /api/rules` describes the rules. The frontend reads these endpoints:

| Endpoint | Use |
|---|---|
| `GET /api/health` | API state in the top bar. |
| `GET /api/datasets` | Dataset name and ready count. |
| `GET /api/targets` | The target table, the sky markers, and the all-sky map: sky position, magnitude, cadence, labels, the active run's values, and the `period-agreement/1` status. |
| `GET /api/runs/default` | The active run when the browser has no choice (rule `default-run/1`). |
| `GET /api/observations/{id}` | Header, labels, and the light-curve artifact of the selected target. |
| `GET /api/runs` | Runs with job states. |
| `GET /api/runs/{id}/results?observation_id=` | Measurements, artifacts, diagnostics, software, and resources of the selected target's job. |
| `POST /api/runs/estimate` | The run form's work estimate and authoritative parameter check. |
| `GET /api/methods` | Methods with their parameter schemas, defaults, cross-field rules, and scientific status. |
| `POST /api/runs` | A new run. |
| `GET /api/runs/{id}` | Parameters and jobs of one run. |
| `POST /api/jobs/{id}/cancel` | Cancels one queued job. |
| `GET /api/artifacts/{id}/content` | Light curve, prepared series, periodogram, search summary, and input checks of the selected target. |

The frontend repeats three API calculations, because they must respond within 50 ms.
They are the search while the user types, the fold during a drag, and the parameter checks while the user types.
`vendor/api-vectors/` is a copy of the backend's shared test vectors. `src/parity.test.ts` checks the three calculations against them.
`scripts/sync-api-vectors.sh <backend-commit>` updates the copy. `vendor/api-vectors/SOURCE` records the backend commit.
The equivalent API operations are `GET /api/targets?q=`, `GET /api/runs/{id}/observations/{observation_id}/fold`, and `POST /api/runs/estimate`.

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
| `src/runs/params.ts` | Parameter form logic from a method schema: field checks and the cross-field rule grammar. `params.test.ts` tests it. |
| `src/runs/useRuns.ts` | Run list refresh, run submission, and job cancellation. |
| `src/runs/RunPanel.tsx` | Run form and run list. |
| `src/layout.ts` | Choice between the full and the compact layout. |
| `src/api/` | HTTP access and response types. |
| `src/data/catalogue.ts` | The target table from the API, the default run, and the observation and job of one target. |
| `src/data/search.ts` | Search parser, grammar `target-query/1`. `search.test.ts` tests it. |
| `src/parity.test.ts` | Parity of the search, the fold, and the parameter checks with the API vectors. |
| `src/data/evidence.ts` | Artifact loading for one result, with a cache of 12 results. |
| `src/plots/surface.ts` | Plot layers: 2D axes, WebGL data, 2D marks. |
| `src/plots/fold.ts` | Phase fold and bins, rule `fold-window/1`. `fold.test.ts` tests it. |
| `src/plots/LightCurve.tsx`, `Periodogram.tsx`, `Fold.tsx` | The three workbench plots. |
| `src/sky/math.ts` | Sky geometry and the stereographic projection. `math.test.ts` tests it. |
| `src/sky/camera.ts` | View state: view center, north-up basis, field of view, and camera turns. |
| `src/sky/shaders.ts` | GLSL for the projection and each sky layer. |
| `src/sky/layers.tsx` | Grid, constellation lines, stars, targets, and the Milky Way. |
| `src/sky/SkyView.tsx` | Canvas, input, tooltip, selection mark, and the sky display. |
| `src/sky/AllSky.tsx` | All-sky map. |
| `src/perf/frames.ts` | Frame time measurement. |
| `src/theme.ts` | Colour tokens for WebGL and CSS. |
