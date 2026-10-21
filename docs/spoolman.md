# Spoolman External Filament Catalog

The Open Filament Database is published in the format [Spoolman](https://github.com/Donkie/Spoolman) reads for its **external filament database**. Point Spoolman at it and most filaments in the database appear in Spoolman's "add filament" dropdown, with density, diameter, weight and colour filled in, and temperatures and spool weight where the database records them. Discontinued products and rows missing a density, net weight or diameter are left out, and about a third of the entries have no temperatures and most have no empty-spool weight, because the database does not have them for every filament.

---

## Use it

Set `EXTERNAL_DB_URL` on the Spoolman container to the `spoolman/` directory of the published site, **with the trailing slash**, and restart Spoolman. Once the first build containing this catalog is published, `https://api.openfilamentdatabase.org/spoolman/` is the expected location:

```yaml
services:
  spoolman:
    image: ghcr.io/donkie/spoolman:latest
    environment:
      - EXTERNAL_DB_URL=https://api.openfilamentdatabase.org/spoolman/
      - EXTERNAL_DB_NAME=Open Filament Database   # optional, labels the library in the UI
```

Spoolman fetches `filaments.json` and `materials.json` from that URL and re-syncs hourly. Setting `EXTERNAL_DB_URL` replaces Spoolman's default [SpoolmanDB](https://donkie.github.io/SpoolmanDB/) catalog rather than adding to it.

---

## What you get

One record per purchasable spool: every size of every colour of every filament becomes one entry.

| Spoolman field | Source in the database |
| --- | --- |
| `id` | `ofd_` + the size's canonical `uuid` from `sizes.json`. The uuid is OFD's stable identifier (it survives renames and typo fixes), and Spoolman installs link to these ids, so the scheme will not change. |
| `manufacturer` | `brand.json` → `name` |
| `name` | The filament name plus the variant (colour) name, with a leading brand name and a bare material name removed. `PETG+` and `PLA Matte` are product lines and are kept. Refill sizes get a ` (refill)` suffix. |
| `material` | `filament.json` → `material` |
| `density` | `filament.json` → `density` |
| `weight` | `sizes.json` → `filament_weight` |
| `diameter` | `sizes.json` → `diameter` |
| `spool_weight` | `sizes.json` → `empty_spool_weight`, otherwise `null` |
| `color_hex` | `variant.json` → `color_hex`, lowercased without `#`; `null` if malformed, or for multi-colour variants (see below) |
| `color_hexes`, `multi_color_direction` | Multi-colour variants only; see below |
| `extruder_temp`, `bed_temp` | The midpoint of the recommended min/max range. A bound of `0` is ignored rather than averaged. |
| `finish` | `matte` trait → `matte` |
| `pattern` | `imitates_marble` trait → `marble`, `glitter` trait → `sparkle` |
| `translucent` | `translucent` or `transparent` trait |
| `glow` | `glow` trait |

Where the database has no value the field is `null`; nothing is guessed. `spool_type` is always `null`.

**Multi-colour filaments** follow SpoolmanDB's convention: they carry `color_hexes` (every colour, in order) and a `null` `color_hex`. Spoolman refuses a multi-colour filament without a `multi_color_direction`, so one is emitted only when the database says how the colours are laid out: `coextruded` gives `coaxial` and `gradual_color_change` gives `longitudinal`. Otherwise (neither trait, or both) the variant is exported as **single-colour** with its first colour in `color_hex` and `color_hexes` and `multi_color_direction` both `null`. The reason is that the database uses a colour list for more than multi-colour spools: glow colours, temperature-change colours, iridescent angle shifts and speckle are stored the same way, and without a direction trait the exporter cannot tell which one it is looking at, so it does not guess. If fewer than two colours are valid after checking, the variant is also single-colour. This relies on the `color_hexes` variant key, which the build produces from `color_hex` arrays (see `tests/test_multicolor_variants.py`).

**Long names.** Spoolman limits a filament name to 64 characters. Longer names are shortened deterministically: a trailing parenthetical such as `(Blue & White)` is dropped if what remains still fits and is unique for that manufacturer, material, weight and diameter; otherwise the middle is elided with `…`, keeping the start and the last words (usually the colour). The build prints how many names were shortened.

**Left out:** discontinued products, any size without a density, net weight or diameter (Spoolman requires all three), and any size without a `uuid` (the id is never derived from anything else).

**Retired uuids.** When data is merged, a retired uuid is recorded in the survivor's `moved_from` (see the [manual](manual.md#moved--former-uuids-moved_from)). Spoolman has no alias concept, so a Spoolman filament linked to a retired id will not follow it automatically; [`api/v1/uuid-index.json`](https://api.openfilamentdatabase.org/api/v1/uuid-index.json) maps former uuids to current ones.

**`materials.json`** holds one entry per material type. The database does not record per-material defaults, so density and temperatures are the **median across the exported (non-discontinued) filaments of that material that record the value**. Temperature medians ignore zero bounds like the per-filament midpoints do, midpoints use Python's round-half-even, and a temperature is `null` where no filament of the material records one.

Output is sorted by `id`, so rebuilding unchanged data gives byte-identical files.

---

## Build it yourself

```bash
python -m ofd build               # writes dist/spoolman/
python -m ofd build --skip-spoolman
```

The mapping lives in [`ofd/builder/spoolman_mapping.py`](../ofd/builder/spoolman_mapping.py), the writer in [`ofd/builder/exporters/spoolman_exporter.py`](../ofd/builder/exporters/spoolman_exporter.py), and both are covered by [`tests/test_spoolman_mapping.py`](../tests/test_spoolman_mapping.py) and [`tests/test_spoolman_exporter.py`](../tests/test_spoolman_exporter.py).

---

## See also

- [OrcaSlicer presets](orcaslicer.md)
- [Spoolman external database format](https://github.com/Donkie/Spoolman/blob/master/spoolman/externaldb.py)
