/**
 * Types for the global paginated search.
 *
 * A flat "search index" — one record per brand, store, material, and filament —
 * is produced two ways that share this shape:
 *   - Cloud: generated at data-build time into /api/v1/search-index.json (served by the CDN).
 *   - Local: built on the fly from the /data filesystem by /api/search-index.
 *
 * The whole index is loaded once and searched + paginated client-side
 * (see $lib/services/searchIndex.ts).
 */

export type SearchEntityType = 'brand' | 'store' | 'material' | 'filament' | 'variant';

export interface SearchRecord {
	type: SearchEntityType;
	/** Primary display name. brand/store/filament: the name; material: the material string ("PLA"). */
	name: string;
	/** App route this card links to (mode-correct, leading slash). */
	href: string;
	/** Brand context: for material & filament the owning brand; for brand itself; absent for store. */
	brandName?: string;
	/** Slug used to link/resolve the brand (parent brand for material/filament). */
	brandSlug?: string;
	/** Logo filename — brand/store only (cloud: logo_slug; local: raw logo.<ext> filename). */
	logo?: string;
	/** Material context (UPPERCASE materialType, e.g. "PLA") — materials & filaments. */
	materialType?: string;
	/** Extra free-text the matcher tokenizes (origin, website, etc.). */
	keywords?: string;
	/**
	 * Owning filament's display name — `variant` records only, where the colour name
	 * alone ("Purple") does not identify the product.
	 */
	filamentName?: string;
	/**
	 * The barcode this record was resolved from. Only set on `variant` records, which
	 * come from the GTIN index rather than the name index — it is what the result card
	 * shows instead of a brand/material subtitle.
	 */
	gtin?: string;
	/** Change-tree key, used to layer local edits and to dedupe: e.g. brands/acme/materials/PLA/filaments/foo. */
	path: string;
}

/** Envelope shape emitted by both producers. */
export interface SearchIndexFile {
	version?: string;
	generated_at?: string;
	count: number;
	records: SearchRecord[];
}

/** Result of a paginated search query. */
export interface SearchResult {
	results: SearchRecord[];
	/** Total matches across all pages. */
	total: number;
	/** 1-based current page (clamped to [1, pageCount]). */
	page: number;
	/** Total number of pages (at least 1). */
	pageCount: number;
}

/**
 * One size carrying a barcode, as published in `/api/v1/gtin-index.json`.
 *
 * Enough to render and link a result without a second request — see
 * `ofd/builder/exporters/gtin_index_exporter.py`, which writes this shape.
 */
export interface GtinEntry {
	/** The code as stored, so the UI can echo the spelling the contributor used. */
	gtin: string;
	brand_name: string;
	brand_slug: string;
	/** The material's type ("PETG"); also its path segment in both API and app. */
	material_slug: string;
	filament_name: string;
	filament_slug: string;
	variant_name: string;
	variant_slug: string;
	filament_weight?: number;
	diameter?: number;
	/** Path of the variant's JSON file in the static API. */
	href: string;
	variant_uuid?: string;
	size_uuid?: string;
}

/**
 * Barcode index envelope. Keyed by the 14-digit GTIN form, so a UPC-A, an EAN-13 and
 * a GTIN-14 for one product share an entry. Values are always arrays — a barcode is a
 * product identifier, not a primary key, and some codes cover a spool and its refill.
 */
export interface GtinIndexFile {
	version?: string;
	generated_at?: string;
	count: number;
	codes: Record<string, GtinEntry[]>;
}
