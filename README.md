# Delta Observatory frontend

The interactive frontend for Delta Observatory: React, Three.js through React Three Fiber, TypeScript, and Vite.
[DESIGN-DECISIONS.md](DESIGN-DECISIONS.md) records the agreed design. [DESIGN.md](../DESIGN.md) sets the requirements.

## Current scope

- Layout L2 shell: top bar, sky, movable rule, workbench, and inspector.
- Workspaces in the top bar: SKY, ANALYSIS, and EVIDENCE. DATASETS is a disabled tab. ANALYSIS and EVIDENCE put an opaque layer over the sky. The sky stays loaded under it.
- Compact layout for phones and narrow windows: the sky on top, a selection strip with previous and next buttons, and tabs.
  The tabs are Targets, Curve, Pgram, Fold, Details, Run, Records, and Compare. The tab strip scrolls. Touch: one finger turns the sky, two fingers zoom, and a tap selects.
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

- Catalogue segments: Targets, Candidates, and Tasks. The Candidates table gives the ID, target, tier, evidence status, identity status, and writer. The Tasks table gives priority, kind, title, state, attempts, holder, and lease time.
- A dashed square on the sky and on the all-sky map marks each target that a candidate record refers to. It does not encode a status.
- Records tab in the right column:
  - Candidate: tier, writer, campaign, the evidence and identity status on two separate axes with basis and actor (rule `candidate-status/1`), the summary, the evidence table, the method warning, and the history of assessments, decisions, and notes, newest first.
  - The evidence table resolves each reference from `GET /api/candidates/{id}`: the stored value, the standard uncertainty or the stored reason that it is unavailable, the unit, and the quality flags. Job, run, and artifact references show their state and checksum. An external file shows as a ↗ proposal with its URI, size, and SHA-256.
  - Agent task: the campaign lifecycle and budgets, the values that the campaign withholds from its agents, the task state, attempts, holder, lease time, the directed instructions, inputs, outputs, and report.
  - Writes for a person: new candidate (platform tier, from the shown result: its job and the chosen search measurements), assessment (basis review), decision (judge person, packet and policy unavailable with a reason), note, new task, and task cancellation. A 422 or 409 response shows at its field.
  - Selecting a candidate selects its first observation. The workbench then shows the run of its job evidence, with a label, and the stored run choice stays.
- EVIDENCE workspace: a full-width candidate table with filters for campaign, tier, kind, evidence status, identity status, writer, and text. The workbench and the Records tab stay.
- ANALYSIS workspace: run A and run B, the parameter differences, the counts (in both, only A, only B, state differs), and a table of the stored period, depth, and depth S/N of both runs. Δ = B − A comes from the API (rule `run-comparison/1`) and carries the display-calculation mark. Filters and a sort by |Δ|. The workbench shows fold A and fold B of the selected row. The Compare tab gives all parameters and the software of both jobs.
- Run controls: cancel for queued and running jobs, Cancel run, Retry failed and cancelled, Compare with…, and Export…. The job table shows attempts, the failure kind and message, and the cancel, retry, and restart limits.
- Export dialog: records only or with artifact files, with counts and stored sizes from the API. The download gives the manifest SHA-256 from the response header. "Check files" checks the size and SHA-256 of every manifest entry in the browser.

## Sign-in

The API needs a client token for each request. The first visit in a browser shows a sign-in panel with one token field.
The browser keeps the token in localStorage and sends it as `Authorization: Bearer <token>`.
The top bar shows the client name. "sign out" removes the token. A 401 response also signs out.
The frontend proxy adds no token. An agent on the same computer therefore cannot act as the signed-in person through port 30871.

The permissions in `GET /api/me` decide which write controls are available. `src/api/access.ts` holds the rules.
Without `run.submit`, the run form, retry, and cancellation are unavailable. Cancellation also needs the client's own run, or `admin`.
Without `record.write`, the candidate, assessment, decision, note, and task controls are disabled. Each disabled control states the missing permission.
A client with neither permission shows "read only" in the top bar.
The display does not authorize anything. The API refuses each write without its permission.

## Development

```bash
npm ci
npm run dev        # http://<host>:5173 on the LAN
npm test
npm run build      # type check and production build in dist/
```

The development server binds to `0.0.0.0:5173`.
It sends `/api` to `http://localhost:30870`, the API NodePort on the k3s node. Set `DELTA_API_URL` to use another API.
The address hash sets the first view, for example `#ra=266.4&dec=-28.9&fov=100`.
Vite accepts IP addresses and `localhost`. It blocks other host names. Set `DELTA_ALLOWED_HOSTS` to a comma-separated list of host names to accept more.

The sky view needs WebGL 2. Without it, the sky area shows the browser's reason, and the other panels still work.
Chromium started with `--disable-gpu` has no WebGL.

`.npmrc` sets exact versions. npm 10.9.8 fails to add `vitest` with the error `Cannot read properties of null (reading 'edgesOut')`.
To add or change `vitest`, run `npm install -D vitest@<version> --legacy-peer-deps`. `npm ci` works without the flag.

## Image and deployment

The `Dockerfile` builds the app with Node 22 and serves `dist/` with unprivileged nginx on port 8080.
`deploy/nginx.conf` sends `/api/` to the `delta-api` Service and answers `/healthz`.
`kubernetes/scripts/build.sh frontend` builds the image in the cluster. [kubernetes/README.md](../kubernetes/README.md) describes the release.
The deployed app is at `http://<node>:30871/`, where `<node>` is the address of the k3s node.

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
| `GET /api/runs` | Runs with job states. With `observation_id`, the runs that hold the selected observation: the workbench offers them when the shown run has no job for it. |
| `GET /api/runs/{id}/results?observation_id=` | Measurements, artifacts, diagnostics, software, and resources of the selected target's job. |
| `POST /api/runs/estimate` | The run form's work estimate and authoritative parameter check. |
| `GET /api/methods` | Methods with their parameter schemas, defaults, cross-field rules, and scientific status. |
| `POST /api/runs` | A new run. |
| `GET /api/runs/{id}` | Parameters and jobs of one run. |
| `POST /api/jobs/{id}/cancel` | Cancels one queued or running job. |
| `POST /api/runs/{id}/cancel`, `POST /api/runs/{id}/retry` | Cancels every queued and running job of a run. Retries its failed and cancelled jobs in a new run. |
| `GET /api/runs/compare` | The comparison of two runs, rule `run-comparison/1`. |
| `GET /api/runs/{id}/export`, `GET /api/candidates/{id}/export` | Evidence exports, contract `export/1`. |
| `GET /api/candidates`, `GET /api/candidates/{id}`, `GET /api/tasks`, `GET /api/campaigns` | Candidate and task tables, candidate detail with resolved evidence and history, campaign lifecycle and budgets. |
| `POST /api/candidates`, `/assessments`, `/decisions`, `/notes`, `/tasks`, `/tasks/{id}/cancel` | Record writes of a person. |
| `GET /api/jobs/{id}` | The run of a candidate's measurement evidence. |
| `GET /api/artifacts/{id}/content` | Light curve, prepared series, periodogram, search summary, and input checks of the selected target. |

The export check repeats `backend/scripts/verify_export.py` in the browser. `crypto.subtle` needs a secure context, and the LAN address is plain http, so `src/exports/sha256.ts` computes SHA-256 in TypeScript. `DecompressionStream("deflate-raw")` reads the ZIP entries.
The frontend calculates no stored value: it formats, sorts, and filters the API values.

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
| `src/runs/RunPanel.tsx` | Run form, run list, cancellation, and retry. |
| `src/runs/RunsHolding.tsx` | Workbench message with buttons for the runs that hold the selected observation. |
| `src/api/records.ts` | Types of the research records, campaigns, and the comparison, and the write helper. |
| `src/records/` | Record tables, the Records tab and its forms, the vocabulary marks, and display helpers. `records.test.ts` tests the helpers. |
| `src/compare/` | ANALYSIS workspace table, the Compare tab, and display helpers. |
| `src/exports/` | Export dialog, ZIP reading, the export check, and SHA-256. `exports.test.ts` tests them. |
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
