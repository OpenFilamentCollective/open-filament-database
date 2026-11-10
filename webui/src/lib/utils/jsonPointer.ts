/**
 * RFC 6901 JSON pointers, as used by review feedback locations
 * (e.g. `/sizes/0/purchase_links/1/url`).
 */

export function parsePointer(pointer: string): string[] {
	if (!pointer) return [];
	return pointer
		.split('/')
		.slice(1)
		.map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** The value at `pointer` inside `value`, or undefined when the path doesn't exist. */
export function valueAtPointer(value: unknown, pointer: string): unknown {
	let current: unknown = value;
	for (const segment of parsePointer(pointer)) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function escapeSegment(segment: string | number): string {
	return String(segment).replace(/~/g, '~0').replace(/\//g, '~1');
}

/** `pointer` extended by one key or index. */
export function childPointer(pointer: string, key: string | number): string {
	return `${pointer}/${escapeSegment(key)}`;
}

function cloneContainer(value: unknown, nextSegment: string): any {
	if (Array.isArray(value)) return [...value];
	if (value !== null && typeof value === 'object') return { ...(value as object) };
	// Creating a missing container: an array when the next step is an index.
	return /^\d+$/.test(nextSegment) ? [] : {};
}

/**
 * A copy of `root` with the value at `pointer` replaced (or, with `remove`, deleted; array
 * elements are spliced out). Only the containers along the path are copied.
 */
export function updateAtPointer(
	root: unknown,
	pointer: string,
	value: unknown,
	remove = false
): any {
	const segments = parsePointer(pointer);
	if (segments.length === 0) return remove ? undefined : value;
	const out = cloneContainer(root, segments[0]);
	let parent: any = out;
	for (let i = 0; i < segments.length - 1; i++) {
		const key = segments[i];
		parent[key] = cloneContainer(parent[key], segments[i + 1]);
		parent = parent[key];
	}
	const last = segments[segments.length - 1];
	if (remove) {
		if (Array.isArray(parent)) parent.splice(Number(last), 1);
		else delete parent[last];
	} else {
		parent[Array.isArray(parent) ? Number(last) : last] = value;
	}
	return out;
}
