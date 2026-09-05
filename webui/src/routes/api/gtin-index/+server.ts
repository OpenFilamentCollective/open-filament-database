import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR } from '$lib/server/entityConfig';
import { IS_CLOUD, API_BASE } from '$lib/server/cloudProxy';
import { normalizeGtin } from '$lib/utils/gtin';
import type { GtinIndexFile, GtinEntry } from '$lib/types/search';

/**
 * Local producer for the barcode (GTIN/EAN/UPC) lookup index.
 *
 * Walks /data for every sizes.json and emits the same { codes } envelope the cloud
 * build writes to /api/v1/gtin-index.json (see ofd/builder/exporters/gtin_index_exporter.py),
 * so the search bar resolves a scanned barcode identically in both modes.
 *
 * Codes are keyed by their 14-digit GTIN form, which makes a UPC-A, an EAN-13 and a
 * GTIN-14 for the same product one lookup. Values are always arrays: a barcode is a
 * product identifier, not a primary key, and 88 codes in the tree cover more than one
 * size (usually a spool and its refill).
 *
 * The local index is rebuilt per request so on-disk edits are never served stale; the
 * cloud aggregate is immutable per CDN build, so that one is cached.
 *
 * Known gap in cloud mode: the index is built when the dataset is, so a GTIN on a
 * variant the contributor has only staged locally won't resolve until the PR merges.
 * Local mode reads from disk and doesn't have this gap. `search-index.json` already
 * behaves this way for cloud-created entities.
 */

let cloudCache: GtinIndexFile | null = null;

async function readJson(file: string): Promise<any> {
	try {
		return JSON.parse(await fs.readFile(file, 'utf-8'));
	} catch {
		return null;
	}
}

async function subdirs(dir: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		return entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name);
	} catch {
		return [];
	}
}

async function buildIndex(): Promise<GtinIndexFile> {
	const codes: Record<string, GtinEntry[]> = {};

	for (const brandDir of await subdirs(DATA_DIR)) {
		const brandRoot = path.join(DATA_DIR, brandDir);
		const brand = await readJson(path.join(brandRoot, 'brand.json'));
		if (!brand) continue;

		for (const materialType of await subdirs(brandRoot)) {
			const materialRoot = path.join(brandRoot, materialType);

			for (const filamentSlug of await subdirs(materialRoot)) {
				const filamentRoot = path.join(materialRoot, filamentSlug);
				const filament = await readJson(path.join(filamentRoot, 'filament.json'));
				if (!filament) continue;

				for (const variantSlug of await subdirs(filamentRoot)) {
					const variantRoot = path.join(filamentRoot, variantSlug);
					const variant = await readJson(path.join(variantRoot, 'variant.json'));
					if (!variant) continue;

					const sizes = await readJson(path.join(variantRoot, 'sizes.json'));
					if (!Array.isArray(sizes)) continue;

					for (const size of sizes) {
						// `ean` is the deprecated source spelling of `gtin`; the build folds
						// it in, and here we read both so local data behaves the same.
						const raw = size?.gtin || size?.ean;
						const code = normalizeGtin(raw);
						if (!code) continue;

						(codes[code] ??= []).push({
							gtin: String(raw),
							brand_name: brand.name ?? brandDir,
							brand_slug: brandDir,
							material_slug: materialType,
							filament_name: filament.name ?? filamentSlug,
							filament_slug: filamentSlug,
							variant_name: variant.name ?? variantSlug,
							variant_slug: variantSlug,
							filament_weight: size.filament_weight,
							diameter: size.diameter,
							href: `brands/${brandDir}/materials/${materialType}/filaments/${filamentSlug}/variants/${variantSlug}.json`
						});
					}
				}
			}
		}
	}

	return { count: Object.keys(codes).length, codes };
}

async function getCloudIndex(): Promise<GtinIndexFile> {
	if (cloudCache) return cloudCache;

	const res = await fetch(`${API_BASE}/api/v1/gtin-index.json`);
	if (!res.ok) {
		// Not published yet (the endpoint landed with #479). An empty index degrades to
		// "no barcode matches" rather than breaking the search page.
		return { count: 0, codes: {} };
	}
	cloudCache = (await res.json()) as GtinIndexFile;
	return cloudCache;
}

export async function GET() {
	try {
		return json(IS_CLOUD ? await getCloudIndex() : await buildIndex());
	} catch (error) {
		console.error('Error building GTIN index:', error);
		return json({ count: 0, codes: {} } satisfies GtinIndexFile, { status: 502 });
	}
}
