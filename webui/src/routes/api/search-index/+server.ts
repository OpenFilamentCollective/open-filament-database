import { json } from '@sveltejs/kit';
import { promises as fs } from 'fs';
import path from 'path';
import { DATA_DIR, STORES_DIR } from '$lib/server/entityConfig';
import { IS_CLOUD, API_BASE } from '$lib/server/cloudProxy';
import { buildSearchRecordsFromAll } from '$lib/server/searchRecordsFromAll';
import type { SearchRecord, SearchIndexFile } from '$lib/types/search';

/**
 * Local producer for the global search index.
 *
 * Walks the on-disk /data (brands → materials → filaments) and /stores trees and
 * emits the same flat { records } envelope the cloud build writes to
 * /api/v1/search-index.json. Hrefs/paths use directory names (= local entity ids),
 * which is how the rest of the local API resolves entities.
 *
 * In cloud mode this proxies to the CDN file for symmetry; the browser normally
 * fetches that file directly via apiFetch('/api/search-index').
 *
 * The local index is rebuilt per request (the client fetches it once per session
 * and on explicit refresh) so on-disk changes — e.g. a `style_data`/sort run that
 * rewrites files — are never served stale. The cloud aggregate is immutable per
 * CDN build, so that one is cached.
 */

let cloudCache: SearchIndexFile | null = null;

async function readJson(file: string): Promise<Record<string, any> | null> {
	try {
		return JSON.parse(await fs.readFile(file, 'utf-8'));
	} catch {
		return null;
	}
}

async function subdirs(dir: string): Promise<string[]> {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() && !e.name.startsWith('.'))
			.map((e) => e.name);
	} catch {
		return [];
	}
}

async function buildStoreRecords(): Promise<SearchRecord[]> {
	const dirs = await subdirs(STORES_DIR);
	const records = await Promise.all(
		dirs.map(async (storeDir): Promise<SearchRecord | null> => {
			const data = await readJson(path.join(STORES_DIR, storeDir, 'store.json'));
			if (!data) return null;
			const shipsFrom = Array.isArray(data.ships_from) ? data.ships_from.join(' ') : data.ships_from;
			const shipsTo = Array.isArray(data.ships_to) ? data.ships_to.join(' ') : data.ships_to;
			return {
				type: 'store',
				name: data.name ?? storeDir,
				href: `/stores/${storeDir}`,
				logo: data.logo || undefined,
				keywords: [data.storefront_url, shipsFrom, shipsTo].filter(Boolean).join(' '),
				path: `stores/${storeDir}`
			};
		})
	);
	return records.filter((r): r is SearchRecord => r !== null);
}

async function buildBrandRecords(brandDir: string): Promise<SearchRecord[]> {
	const brandRoot = path.join(DATA_DIR, brandDir);
	const brand = await readJson(path.join(brandRoot, 'brand.json'));
	if (!brand) return [];

	const brandName = brand.name ?? brandDir;
	const records: SearchRecord[] = [
		{
			type: 'brand',
			name: brandName,
			href: `/brands/${brandDir}`,
			brandName,
			brandSlug: brandDir,
			logo: brand.logo || undefined,
			keywords: [brand.origin, brand.website].flat().filter(Boolean).join(' '),
			path: `brands/${brandDir}`
		}
	];

	const materialDirs = await subdirs(brandRoot);
	const nested = await Promise.all(
		materialDirs.map(async (materialType): Promise<SearchRecord[]> => {
			const materialRoot = path.join(brandRoot, materialType);
			const material = await readJson(path.join(materialRoot, 'material.json'));
			if (!material) return [];

			const out: SearchRecord[] = [
				{
					type: 'material',
					name: material.material ?? materialType,
					href: `/brands/${brandDir}/${materialType}`,
					brandName,
					brandSlug: brandDir,
					materialType,
					keywords: material.material ?? '',
					path: `brands/${brandDir}/materials/${materialType}`
				}
			];

			const filamentDirs = await subdirs(materialRoot);
			const filaments = await Promise.all(
				filamentDirs.map(async (filamentSlug): Promise<SearchRecord | null> => {
					const filament = await readJson(
						path.join(materialRoot, filamentSlug, 'filament.json')
					);
					if (!filament) return null;
					return {
						type: 'filament',
						name: filament.name ?? filamentSlug,
						href: `/brands/${brandDir}/${materialType}/${filamentSlug}`,
						brandName,
						brandSlug: brandDir,
						materialType,
						keywords: filament.name ?? '',
						path: `brands/${brandDir}/materials/${materialType}/filaments/${filamentSlug}`
					};
				})
			);
			out.push(...filaments.filter((f): f is SearchRecord => f !== null));
			return out;
		})
	);

	for (const group of nested) records.push(...group);
	return records;
}

async function buildIndex(): Promise<SearchIndexFile> {
	const brandDirs = await subdirs(DATA_DIR);
	const [stores, brandGroups] = await Promise.all([
		buildStoreRecords(),
		Promise.all(brandDirs.map(buildBrandRecords))
	]);

	const records: SearchRecord[] = [...stores];
	for (const group of brandGroups) records.push(...group);

	return { count: records.length, records };
}

/**
 * Cloud mode: prefer the dedicated CDN file; if it isn't published yet, build a
 * lean index from the existing json/all.json aggregate so search still works.
 * The browser always receives the small { records } envelope either way.
 */
async function getCloudIndex(): Promise<SearchIndexFile> {
	if (cloudCache) return cloudCache;

	const dedicated = await fetch(`${API_BASE}/api/v1/search-index.json`);
	if (dedicated.ok) {
		cloudCache = (await dedicated.json()) as SearchIndexFile;
		return cloudCache;
	}

	const allRes = await fetch(`${API_BASE}/json/all.json`);
	if (!allRes.ok) {
		throw new Error(`Cloud aggregate unavailable (${allRes.status})`);
	}
	const records = buildSearchRecordsFromAll(await allRes.json());
	cloudCache = { count: records.length, records };
	return cloudCache;
}

export async function GET() {
	try {
		if (IS_CLOUD) {
			return json(await getCloudIndex());
		}
		return json(await buildIndex());
	} catch (error) {
		console.error('Error building search index:', error);
		return json({ count: 0, records: [] } satisfies SearchIndexFile, { status: 502 });
	}
}
