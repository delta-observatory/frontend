# Sky display assets

These files are display assets for the background sky. They are not scientific references.
The star catalogue choice is an open decision in [DESIGN-DECISIONS.md](../../DESIGN-DECISIONS.md).

| File | Source | Content |
|---|---|---|
| `stars.json` | `data/stars.6.json` from the npm package `d3-celestial` 0.7.35 | 5044 stars to magnitude 6. Columns `ra` and `dec` in degrees, `mag`, and `bv` (B−V colour index, null when absent). |
| `constellations.json` | `data/constellations.lines.json` from the same package | 150 constellation line strings as RA and Dec pairs in degrees. |

The package states its star source as XHIP, an extended Hipparcos compilation (Anderson and Francis 2012, VizieR V/137D).
The package uses the BSD licence.

Source file SHA-256 values:

- `stars.6.json`: `0297b8fa3adfbce1dc26566f61c4abcc1df4f29c6a28729ca06b56d1c6d25602`
- `constellations.lines.json`: `294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c`

Download the two files from `https://cdn.jsdelivr.net/npm/d3-celestial@0.7.35/data/`.
Then run `npm run sky-data -- <download directory>`.
