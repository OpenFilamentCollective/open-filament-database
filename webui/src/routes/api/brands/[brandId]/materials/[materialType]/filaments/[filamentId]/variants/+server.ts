import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { normalizeBrandId } from '../../../../../../utils';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), '../data');

// Transform raw variant data to frontend format
function transformVariant(raw: any): any {
	const { name, ...rest } = raw;
	return {
		...rest,
		color_name: name ?? rest.color_name ?? '',
		discontinued: raw.discontinued ?? false
	};
}

// Transform frontend variant data back to storage format
function transformVariantForStorage(data: any): any {
	const { color_name, brandId, materialType, filamentId, variantDir, ...rest } = data;
	return {
		...rest,
		name: color_name ?? rest.name ?? ''
	};
}

export const GET: RequestHandler = async ({ params }) => {
	const { brandId, materialType, filamentId } = params;

	try {
		// Path to the filament directory
		const filamentDir = path.join(DATA_DIR, brandId, materialType, filamentId);

		// Read all directories in the filament directory (each represents a variant)
		const entries = await fs.readdir(filamentDir, { withFileTypes: true });

		const variants = await Promise.all(
			entries
				.filter((entry) => entry.isDirectory())
				.map(async (entry) => {
					const variantPath = path.join(filamentDir, entry.name, 'variant.json');
					try {
						const content = await fs.readFile(variantPath, 'utf-8');
						const variant = JSON.parse(content);
						return {
							...transformVariant(variant),
							brandId,
							materialType,
							filamentId,
							variantDir: entry.name
						};
					} catch (error) {
						// Skip directories without variant.json
						return null;
					}
				})
		);

		const validVariants = variants.filter((v) => v !== null);
		return json(validVariants);
	} catch (error) {
		console.error(
			`Error reading variants for ${brandId}/${materialType}/${filamentId}:`,
			error
		);
		return json([], { status: 500 });
	}
};

export const POST: RequestHandler = async ({ params, request }) => {
	const { brandId, materialType, filamentId } = params;

	try {
		const { PUBLIC_APP_MODE } = await import('$env/static/public');
		const IS_LOCAL = PUBLIC_APP_MODE !== 'cloud';

		const variantData = await request.json();

		// Generate variant slug from color name if not provided
		const variantSlug = variantData.slug ||
			variantData.color_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

		if (IS_LOCAL) {
			const variantDir = path.join(DATA_DIR, brandId, materialType, filamentId, variantSlug);

			// Create the variant directory
			await fs.mkdir(variantDir, { recursive: true });

			// Transform to storage format and add required fields
			const storageData = transformVariantForStorage(variantData);
			storageData.id = variantSlug;
			storageData.slug = variantSlug;
			storageData.filament_id = filamentId;
			const content = JSON.stringify(storageData, null, 4) + '\n';
			await fs.writeFile(path.join(variantDir, 'variant.json'), content, 'utf-8');

			return json({
				success: true,
				variant: { ...variantData, id: variantSlug, slug: variantSlug, brandId, materialType, filamentId }
			}, { status: 201 });
		} else {
			// In cloud mode, pretend success but don't write
			return json({
				success: true,
				mode: 'cloud',
				variant: { ...variantData, id: variantSlug, slug: variantSlug }
			}, { status: 201 });
		}
	} catch (error) {
		console.error(`Error creating variant for ${brandId}/${materialType}/${filamentId}:`, error);
		return json({ error: 'Failed to create variant' }, { status: 500 });
	}
};
