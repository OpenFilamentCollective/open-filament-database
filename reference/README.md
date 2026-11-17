# Reference data

Data that is **not** manufacturer data, so it is kept outside `data/`. The crawler, the UUID tooling and the data-quality checks never read this folder.

## `material_defaults.json`

Generic per-material carbon estimates (kg CO₂e per kg, virgin and recycled), keyed on the material types in [`schemas/material_types_schema.json`](../schemas/material_types_schema.json). Tools can use these as a fallback when a brand publishes no figure of its own.

- Validated against [`schemas/material_defaults_schema.json`](../schemas/material_defaults_schema.json) during `ofd build`. An invalid file fails the build.
- Published as `api/v1/material-defaults.json`. The API index lists it only when the file exists.
- Every entry is `"kind": "estimate"` and needs `sources`.

It ships with `entries: []` on purpose. The values will be supplied separately (possibly from a commissioned LCA). **Do not fill it from a single brand's figure.** Brand figures belong in that brand's `sustainability` data, and a default built from one brand would misrepresent every other.
