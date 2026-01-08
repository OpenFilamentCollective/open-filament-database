import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	// Variant schema definition
	const schema = {
		type: 'object',
		required: ['slug', 'color_name', 'color_hex'],
		properties: {
			id: {
				type: 'string',
				format: 'uuid',
				title: 'ID'
			},
			filament_id: {
				type: 'string',
				format: 'uuid',
				title: 'Filament ID'
			},
			slug: {
				type: 'string',
				title: 'Slug',
				description: 'URL-friendly identifier for the variant'
			},
			color_name: {
				type: 'string',
				title: 'Color Name',
				description: 'Display name of the color'
			},
			color_hex: {
				type: 'string',
				pattern: '^#[0-9A-Fa-f]{6}$',
				title: 'Color Hex',
				description: 'Hexadecimal color code (e.g., #FF5733)'
			},
			discontinued: {
				type: 'boolean',
				title: 'Discontinued',
				default: false
			}
		}
	};

	return json(schema);
};
