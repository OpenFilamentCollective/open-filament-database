/**
 * Helpers for the variant `color_hex` field.
 *
 * The schema allows either a single hex string or an array of them (multi-colour
 * filaments — co-extruded, gradient, etc). By convention a single colour is stored
 * as a plain string and only multi-colour variants use an array, so everything that
 * reads or writes `color_hex` has to cope with both shapes.
 */

/** A full 6-digit hex colour, with the leading `#`. */
const FULL_HEX = /^#[a-fA-F0-9]{6}$/;

export type ColorHexValue = string | string[] | null | undefined;

/** Normalize either shape to a list of hex strings (empty entries kept out). */
export function colorHexList(value: ColorHexValue): string[] {
	if (value == null) return [];
	const list = Array.isArray(value) ? value : [value];
	return list.filter((hex): hex is string => typeof hex === 'string' && hex.length > 0);
}

/** The first colour — used where only one swatch/label fits. */
export function primaryColorHex(value: ColorHexValue): string {
	return colorHexList(value)[0] ?? '';
}

/**
 * True when every entry is a complete `#RRGGBB` value and there is at least one.
 * Deliberately checks the raw entries rather than `colorHexList` — a half-filled
 * row in the form must fail validation, not be quietly dropped.
 */
export function isValidColorHex(value: ColorHexValue): boolean {
	if (value == null) return false;
	const list = Array.isArray(value) ? value : [value];
	return list.length > 0 && list.every((hex) => typeof hex === 'string' && FULL_HEX.test(hex));
}

/**
 * Store the canonical shape for a list of colours: a bare string for a single
 * colour, an array once there is more than one.
 */
export function packColorHex(list: string[]): string | string[] {
	return list.length > 1 ? list : (list[0] ?? '');
}

/**
 * CSS `background` for a swatch. Multi-colour variants render as equal-width
 * bands so every colour is visible rather than only the first.
 */
export function colorSwatchStyle(value: ColorHexValue): string {
	const list = colorHexList(value);
	if (list.length === 0) return '';
	if (list.length === 1) return `background-color: ${list[0]}`;

	const step = 100 / list.length;
	const stops = list.flatMap((hex, i) => [`${hex} ${i * step}%`, `${hex} ${(i + 1) * step}%`]);
	return `background: linear-gradient(135deg, ${stops.join(', ')})`;
}

/** Human-readable form for labels and tooltips, e.g. `#F6C500 / #4D6383`. */
export function formatColorHex(value: ColorHexValue): string {
	return colorHexList(value).join(' / ');
}
