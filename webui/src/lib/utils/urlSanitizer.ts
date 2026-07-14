/**
 * URL tracker-stripping and host helpers for purchase/store links.
 *
 * Mirrors the Rust `url_tracker` rule in ofd-validator-core so the webui cleans links at
 * entry time (auto-strip on paste, one-click "Clean" fix) while the validator still warns
 * on anything that slips through. Keep the tracking list in sync with
 * `crates/ofd-validator-core/src/validators/url_tracker.rs`.
 */

/**
 * Known tracking query-parameter keys (compared case-insensitively). Prefix families
 * (`utm_`, `mc_`, `pk_`) are handled in `isTrackingKey`.
 *
 * Shopify product selectors `variant` and `id` are intentionally NOT included — they can
 * point at a specific colour/product, so they are treated as meaningful.
 */
const TRACKING_PARAMS = new Set<string>([
	'tag',
	'linkcode',
	'psc',
	'th',
	'ref',
	'ref_',
	'fbclid',
	'gclid',
	'gclsrc',
	'dclid',
	'msclkid',
	'yclid',
	'twclid',
	'ttclid',
	'igshid',
	'si',
	'mc_cid',
	'mc_eid',
	'_pos',
	'_psq',
	'_ss',
	'_v',
	'_sid',
	'spm',
	'scm',
	'aff',
	'affid',
	'srsltid',
	'gad_source',
	'epik',
	'pk_campaign',
	'pk_kwd',
	// Amazon / marketplace search-result context (identity lives in the /dp/<ASIN> path)
	'dib',
	'dib_tag',
	'keywords',
	'qid',
	'sr',
	'sprefix',
	'crid',
	'ascsubtag',
	'smid',
	'content-id',
	'qsid',
	'rnid',
	'refinements',
	'_encoding',
	'pldnsite'
]);

/** Hosts (regex on the lowercased hostname) where the product identity is entirely in the
 *  path, so every query param is search/tracking context and can be dropped wholesale. */
const WHOLE_QUERY_HOSTS = /(^|\.)(amazon|ebay)\.[a-z.]+$/;
const SHORTLINK_HOSTS = new Set(['a.co', 'amzn.to', 'amzn.eu']);

function isTrackingKey(key: string): boolean {
	const k = key.trim().toLowerCase();
	return (
		k.startsWith('utm_') ||
		k.startsWith('mc_') ||
		k.startsWith('pk_') ||
		k.startsWith('pd_rd_') ||
		k.startsWith('pf_rd_') ||
		TRACKING_PARAMS.has(k)
	);
}

/** True if the whole query string should be dropped for this URL's host (e.g. Amazon). */
function hasDisposableQuery(base: string): boolean {
	const host = (getHost(base) ?? '').toLowerCase();
	return WHOLE_QUERY_HOSTS.test(host) || SHORTLINK_HOSTS.has(host);
}

/** Tracking data (e.g. `#utm_source=x`) vs a content anchor (e.g. `#productinfo`, kept). */
function isTrackingFragment(fragment: string): boolean {
	if (!fragment.includes('=')) return false;
	const firstKey = fragment.split(/[&=]/)[0] ?? '';
	return isTrackingKey(firstKey);
}

/**
 * Remove known tracking parameters (plus an empty `?` and tracking-only fragments) from a
 * URL, preserving the original ordering/encoding of everything kept. Idempotent. Returns the
 * input unchanged when there is nothing to strip.
 */
export function stripTrackingParams(url: string): string {
	if (!url) return url;

	const hashIdx = url.indexOf('#');
	const beforeFrag = hashIdx === -1 ? url : url.slice(0, hashIdx);
	const fragment = hashIdx === -1 ? null : url.slice(hashIdx + 1);

	const qIdx = beforeFrag.indexOf('?');
	const base = qIdx === -1 ? beforeFrag : beforeFrag.slice(0, qIdx);
	const query = qIdx === -1 ? null : beforeFrag.slice(qIdx + 1);

	let out = base;

	if (query !== null && !hasDisposableQuery(base)) {
		const kept = query.split('&').filter((pair) => {
			if (pair === '') return false;
			const key = pair.split('=')[0] ?? '';
			return !isTrackingKey(key);
		});
		if (kept.length > 0) out += '?' + kept.join('&');
	}

	if (fragment !== null && fragment !== '' && !isTrackingFragment(fragment)) {
		out += '#' + fragment;
	}

	return out;
}

/** True if stripping tracking data would change the URL. */
export function hasTrackingParams(url: string): boolean {
	return stripTrackingParams(url) !== url;
}

/** Entity fields that hold a URL (kept in sync with style_data.py's URL_FIELDS). */
const URL_FIELDS = new Set(['url', 'storefront_url', 'website', 'data_sheet_url', 'safety_sheet_url']);

/**
 * Return a deep copy of an entity with tracking params stripped from every known URL field
 * (recursing into nested objects/arrays, e.g. `sizes[].purchase_links[].url`). Used to make
 * tracker removal mandatory at submission time without touching the in-progress form value.
 */
export function stripTrackersDeep<T>(value: T): T {
	if (Array.isArray(value)) {
		return value.map((v) => stripTrackersDeep(v)) as unknown as T;
	}
	if (value && typeof value === 'object') {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = URL_FIELDS.has(k) && typeof v === 'string' ? stripTrackingParams(v) : stripTrackersDeep(v);
		}
		return out as T;
	}
	return value;
}

/**
 * Extract the hostname (e.g. `shop.polymaker.com`, no port) from an absolute or
 * protocol-less URL. Returns null when unparseable.
 */
export function getHost(url: string): string | null {
	if (!url) return null;
	try {
		const parsed = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`);
		return parsed.hostname || null;
	} catch {
		return null;
	}
}

/**
 * Rewrite the host of a URL, preserving path/query/fragment. Returns the input unchanged if
 * it cannot be parsed. If the input had no protocol, the result stays protocol-less too.
 */
export function rewriteHost(url: string, newHost: string): string {
	if (!url || !newHost) return url;
	try {
		const hadProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(url);
		const parsed = new URL(hadProto ? url : `https://${url}`);
		parsed.hostname = newHost;
		const result = parsed.toString();
		return hadProto ? result : result.replace(/^https:\/\//, '');
	} catch {
		return url;
	}
}
