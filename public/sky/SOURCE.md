# Sky display assets

These files are display assets for the background sky. They are not scientific references.
[DESIGN-DECISIONS.md](../../DESIGN-DECISIONS.md) records the star catalogue decision.

| File | Source | Content |
|---|---|---|
| `stars.json` | `data/stars.8.json` from the npm package `d3-celestial` 0.7.35 | 41411 stars to magnitude 8. Columns `ra` and `dec` in degrees, `mag`, and `bv` (B−V colour index, null when absent). |
| `constellations.json` | `data/constellations.lines.json` from the same package | 150 constellation line strings as RA and Dec pairs in degrees. |

The package states its star source as XHIP, an extended Hipparcos compilation (Anderson and Francis 2012, VizieR V/137D).
The package gives its constellation lines from the IAU constellation figures, with changes by its author.

d3-celestial is Copyright (c) 2015, Olaf Frohn, under the BSD 3-Clause licence.
[LICENSE-d3-celestial](LICENSE-d3-celestial) holds its licence text. Keep that file next to these files and in each build.

Cite the star catalogue as: Anderson, E., and Francis, C. 2012, Astronomy Letters, 38, 331.
This display uses the VizieR catalogue access tool, CDS, Strasbourg, France.

Source file SHA-256 values:

- `stars.8.json`: `e3ec6cde89bae0dde064d91c1edb9ec53c3c40d5c12fdf5d30f9a4de5dbc2143`
- `constellations.lines.json`: `294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c`

Download the two files from `https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/`.
Then run `npm run sky-data -- <download directory>`.
