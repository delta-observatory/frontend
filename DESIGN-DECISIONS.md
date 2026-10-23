# Frontend design decisions

This file records the agreed design decisions for the Delta Observatory frontend.
Richard directs the visual style and the interaction design.
[DESIGN.md](https://github.com/delta-observatory/delta-observatory/blob/main/DESIGN.md) sets the frontend requirements. This file records the choices inside those requirements.
[README.md](README.md) describes the code that exists.

## Agreed

| Item | Decision |
|---|---|
| Default workspace | EXPLORE: a ranked signal queue, linked scientific charts, and candidate review. SKY remains available for spatial context. |
| Visual direction | Direction A, planetarium in SKY: the sky fills the screen, and opaque panels with hairline borders sit on it. |
| Theme | Dark only. The night sky sets the base of the interface. |
| Sky view | The interface shows a star field on a dome. Observations, results, and tests show as overlays on the sky. |
| Sky frame | A sky sphere in equatorial coordinates with no observing site and no horizon. The camera is at the center. Every target is visible. |
| SKY layout | L2, sky over workbench. The sky fills the top part, with the catalogue on it. The workbench below holds a full-width light curve, the periodogram, the phase fold, and the inspector. A movable rule sets the space between the two parts. |
| SKY compact layout | Phones and windows narrower than 760 px, and phones in landscape. The sky stays on top, with the all-sky map. A strip shows the selection with previous and next buttons. Tabs include Targets, Datasets, Curve, Periodogram, Fold, and Details. Datasets uses the full work area. Each plot uses the full width. In landscape, the sky is on the left and the tabs are on the right. |
| Touch | One finger turns the sky. Two fingers zoom. A tap selects a target. A drag on the light curve selects a time range, and a tap on a periodogram peak sets a display period. Buttons clear the time range and return to the stored fold. A row tap in Targets opens the Curve tab. |
| Selection | A click on a sky marker or a catalogue row selects the target. The sky turns to the target in 0.3–0.9 s. **j** and **k** select the next and previous target in the filtered list. |
| Navigation | North up. A drag turns the sky, and the wheel zooms. **F** turns the sky to the selected target. |
| Motion | Animated by default. A reduced-motion setting removes camera animation. |
| Hover | A tooltip shows the values of a sky marker. When the pointer is on a catalogue row, its sky marker shows a frame. |
| Search | Free text, field filters (`snr`, `err`, `p`, `pref`, `tmag`, `sector`), and class buttons. Targets that do not match become dim on the sky. They stay visible. |
| All-sky map | A small all-sky map shows all targets and the current view. A click on the map turns the sky to that position. |
| Light curve | A drag selects a time range. The phase fold then uses only that range. The pointer time shows as a line in the fold. **Esc** clears the range. |
| Display fold | A click on a periodogram peak folds the data at that period. The fold title says "not a stored result", and the box model is hidden. **Esc** returns to the stored result. |
| Keys | **/** search, **j** and **k** next and previous, **F** fly to target, **Esc** clear, **+** and **−** zoom. |
| Star catalogue | XHIP, an extended Hipparcos compilation (VizieR V/137D), to magnitude 8: 41411 stars from the `d3-celestial` package. Stars to magnitude 6 show at a 110° field of view. Fainter stars fade in as the view zooms in, to magnitude 8 at 40°. |
| Run controls | Desktop: the Run tab beside Details in the right column. Phone: the Run tab. The run name in the top bar opens it. |
| Run form | Built from the method's parameter schema: units, defaults, limits, and cross-field rules. Changed values have an amber mark. Inputs: the selected target or all search matches. The API estimate shows trial periods and worker time before the start. |
| Status colours | The API rule `period-agreement/1` sets each marker colour. Its thresholds are display bins, not validation criteria. |
| Active run | One run at a time supplies the sky colours, plots, and measurements. "Show results" selects it, and the browser remembers it. Without a choice, the API rule `default-run/1` selects the run with the most complete jobs. The newest run wins a tie. A run that finishes does not replace the shown run. |
| Tools | React, Canvas 2D, TypeScript, and Vite. The sky, targets, and plots render on the CPU. Tables, the inspector, and forms are React. |
| API access | In development, a Vite proxy sends `/api` to the API NodePort, `http://localhost:30870` by default. The deployed build uses NodePort 30871 and its own proxy to the API service. CORS stays disabled. |
| Shape | Sharp corners on all panels, controls, and markers that have a box shape. |
| Density | A precise and dense layout. |
| Character | Technical and restrained. The interface must not look like a generic web application template. |
| Numbers | Monospace type with tabular figures for all numbers. |
| Workspaces | Top-bar tabs EXPLORE, SKY, DATASETS, ANALYSIS, and EVIDENCE. EXPLORE uses the full work area. DATASETS uses the full work area, with a dataset list and Observations, Runs, and Experiments tabs. ANALYSIS and EVIDENCE replace the sky area. |
| Research records | The catalogue panel has three segments: Targets, Candidates, and Tasks. The right column has a Records tab for one candidate or one agent task. Phones have a Records tab. The EVIDENCE workspace holds a full-width candidate table with filters for long lists. |
| Candidate marks | A dashed square on the sky and on the all-sky map marks a target that a candidate record refers to. The square encodes no status. |
| Record vocabulary | One meaning for each mark. Status chips are monochrome: dotted border for unreviewed or unchecked, solid for supported, matched, or unmatched, dashed for ambiguous, and struck text for rejected. The text gives the status. The evidence axis and the identity axis always show separately, each with its basis and actor. A decision of judge model has a hatched MODEL JUDGMENT tag. Writers: ● person, ◆ agent, ■ service. Tier: solid PLATFORM, dashed LAB ↗ for an external proposal, and IMPORTED for an import route. A blue outline marks a display calculation and names its rule. A striped mark shows a value that a campaign withholds from its agents. The tess-bls warning box shows next to method values. |
| Candidate evidence | Selecting a candidate selects its first observation. The workbench shows the run of the candidate's job evidence with a label. The stored run choice stays until "Show this run". |
| Run comparison | The ANALYSIS workspace. Run A and run B, the parameter differences, the counts, and a table of stored values of both runs. Δ = B − A carries the display-calculation mark and no uncertainty, because both values come from the same observations. Filters: in both, only A, only B, state differs. Sort by |Δ|. The workbench shows fold A and fold B side by side. The right column has a Compare tab with all parameters and the software. |
| Run controls | Cancel for queued and running jobs, Cancel run, Retry failed and cancelled, Compare with…, and Export…. The job table shows the failure kind and message. Text states the cancel, retry, and restart limits. |
| Export | A dialog: records only, or records and artifact files with their stored sizes. After the download it gives the manifest SHA-256 and a "Check files" step that checks every file in the browser. |
| 3D views | Four views: a sky map of the targets, a period–duration–power surface, a phase-fold animation, and an orbit view. |
| Orbit view | The data has no distance or stellar mass. The orbit view labels each inferred value and each assumption. |
| First workflow | Free search of observations, then tests on the selected observations. |
| First vertical | Inspection of one target inside the sky view. A run with changed parameters follows. Survey views reuse the standards that this step sets. |

The first vertical starts with target inspection for these reasons:

- It needs every element that later screens reuse: plots, measurement tables, units, uncertainty, flags, and the scientific status.
- It sets the visual difference between observations and predictions before other screens depend on it.
- The run and survey workflows use the same components with more records.

## Performance targets

The targets apply to the review environment below, at any window size.

| Measure | Target |
|---|---|
| First load to a usable sky and catalogue, empty cache | ≤ 1.5 s |
| Target change to visible plots, first load of the target | ≤ 400 ms |
| Target change to visible plots, target already loaded | ≤ 100 ms |
| Sky turn, zoom, and fly | 60 frames per second. The 95th percentile frame time is ≤ 16.7 ms. |
| Hover, time range, and display fold, from input to screen | ≤ 50 ms at the 95th percentile |
| Browser memory after all 46 targets are open | ≤ 500 MB |

An in-app performance display shows these measures.
A binary artifact format is a possible fix if the JSON artifacts miss the 400 ms target. That change needs a new contract version in `database/contracts/` and a review with Richard.

## Review environment

| Item | Value |
|---|---|
| Computer | The workstation that runs the k3s node on the LAN. |
| Browser | Chromium with GPU acceleration disabled. The sky and plots use software Canvas 2D. WebGL is not required. |
| Graphics card | NVIDIA GeForce RTX 3080, 10 GiB. |
| Screen | No fixed resolution. The layout fits the browser window. |

## Requirements from DESIGN.md

- Observations and predictions look different. Uncertainty stays visible.
- Units, quality flags, and the provisional scientific status show next to each result.
- Display normalization does not change scientific values.
- The interface has reduced-motion controls and usable static views.

## Open

No design decision is open.

## Explore workspace

A left queue lists completed BLS signals. The center holds the light curve, periodogram, and phase fold.
The right panel provides Review, Details, and Run search. Narrow windows place the review panel below the charts.
Phones place the queue above the charts. Each chart keeps the full available width.

The queue orders stored depth signal-to-noise ratios. Its order makes no planet probability or detection claim.
The default sample excludes known-planet and eclipsing-binary labels. People can select all searched observations or linked candidate records.
Time zoom, time selection, alternate periods, full-cycle folds, and sector filters support visual investigation.
Candidate records keep their cited evidence. The chart identifies its own run and job independently.
Search controls submit the selected observation or the current queue page after an API estimate.
