# Components & Forms Audit

## Security Issues

| # | File | Line(s) | Issue | Fix |
|---|------|---------|-------|-----|
| 1 | `components/entity/EntityDetails.svelte` | 96-110 | User-provided URLs rendered in `href` — relies solely on `isSafeUrl()` | Ensure protocol whitelist is strict (http/https only) |
| 2 | `components/form-fields/LogoUpload.svelte` | 750 | Data URLs from image files set directly as `src` | Add MIME type whitelist before rendering |

## Hardcoded Values

| # | File | Line(s) | Value | Fix |
|---|------|---------|-------|-----|
| 1 | `form-fields/LogoUpload.svelte` | 58, 689, 776 | Canvas 400×400, min 100×100 | Move to shared image config constants |
| 2 | `form-fields/LogoUpload.svelte` | 330-332 | Handle sizes (14, 10, 24) | Extract to component config |
| 3 | `form-fields/SizeCard.svelte` | 97-99 | Diameter options `[1.75, 2.85]` | Load from schema or config |
| 4 | `form-fields/SizeCard.svelte` | 88-146 | Placeholder values (1000, 250, 100) | Move to config |
| 5 | `form-fields/ColorHexField.svelte` | 68, 80 | Placeholder `FF5733`, error message string | Extract to constants |
| 6 | `entity/EntityCard.svelte` | 74-81 | Badge color map (red, yellow, green...) | Move to theme config |
| 7 | `ui/Modal.svelte` | 17-36 | Width/height mappings, `h-[90vh]` | Extract to config |
| 8 | `forms/BrandForm.svelte` | 46 | Default origin `"Unknown"` | Derive from schema defaults |
| 9 | `forms/VariantForm.svelte` | 60-63, 110 | Section tooltips, "Default Slicer Settings" title | Move to config constants |
| 10 | `forms/FilamentForm.svelte` | 84, 164 | Tooltip text, "Slicer Settings" title | Move to config |

## Redundancies

| # | Pattern | Locations | Fix |
|---|---------|-----------|-----|
| 1 | "Search country..." placeholder | `CountryCodeSelect.svelte:19`, `CountryCodeListSelect.svelte:20` | Shared constant |
| 2 | Logo required error message | `BrandForm.svelte:82`, `StoreForm.svelte:64` | Shared message constant |
| 3 | "Logo will be updated when you save" | `BrandForm.svelte:155`, `StoreForm.svelte:102` | Shared message constant |
| 4 | Remove button SVG icons | `CountryCodeList.svelte:69-75`, `TagInput.svelte:60-66` | Use `CloseIcon` component everywhere |
| 5 | Form validation for required fields | `BrandForm:91`, `FilamentForm:143`, `MaterialForm:97`, `VariantForm:347` | Create `validateFormCanSubmit()` utility |
| 6 | Country code fetch/filter logic | `CountryCodeSelect`, `CountryCodeListSelect` | Extract to shared module |
| 7 | Default size object creation | `VariantForm.svelte:219-236` | Create `createDefaultSize()` factory |
