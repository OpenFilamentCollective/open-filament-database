import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock $app/environment
vi.mock('$app/environment', () => ({
	browser: true
}));

// Must import after mocks
import {
	copyEntity,
	getClipboard,
	hasCompatibleClipboard,
	clearClipboard,
	prepareDuplicateData,
	prepareEntityData,
	type ClipboardEntry
} from '../clipboardService';

describe('Clipboard Service', () => {
	beforeEach(() => {
		localStorage.clear();
		// Mock navigator.clipboard
		Object.defineProperty(navigator, 'clipboard', {
			value: { writeText: vi.fn().mockResolvedValue(undefined) },
			writable: true,
			configurable: true
		});
	});

	describe('copyEntity', () => {
		it('should store entry in localStorage', async () => {
			await copyEntity('brand', { name: 'Test Brand', website: 'https://test.com' }, 'brands/test');

			const stored = JSON.parse(localStorage.getItem('ofd_clipboard')!);
			expect(stored.entityType).toBe('brand');
			expect(stored.data.name).toBe('Test Brand');
			expect(stored.sourcePath).toBe('brands/test');
			expect(stored.copiedAt).toBeDefined();
		});

		it('should also write to system clipboard', async () => {
			await copyEntity('material', { material: 'PLA' }, 'brands/test/materials/PLA');

			expect(navigator.clipboard.writeText).toHaveBeenCalledOnce();
			const arg = (navigator.clipboard.writeText as any).mock.calls[0][0];
			const parsed = JSON.parse(arg);
			expect(parsed.entityType).toBe('material');
		});

		it('should store children data when provided', async () => {
			const children = { filaments: [{ name: 'Basic', id: 'basic' }] };
			await copyEntity('material', { material: 'PLA' }, 'path', children);

			const stored = JSON.parse(localStorage.getItem('ofd_clipboard')!);
			expect(stored.children).toBeDefined();
			expect(stored.children.filaments).toHaveLength(1);
			expect(stored.children.filaments[0].name).toBe('Basic');
		});

		it('should not store children field when not provided', async () => {
			await copyEntity('brand', { name: 'Test' }, 'brands/test');

			const stored = JSON.parse(localStorage.getItem('ofd_clipboard')!);
			expect(stored.children).toBeUndefined();
		});

		it('should deep-clone data to avoid proxy issues', async () => {
			const data = { name: 'Test', nested: { a: 1 } };
			await copyEntity('brand', data, 'brands/test');

			const stored = JSON.parse(localStorage.getItem('ofd_clipboard')!);
			data.nested.a = 999;
			expect(stored.data.nested.a).toBe(1);
		});
	});

	describe('getClipboard', () => {
		it('should return null when empty', () => {
			expect(getClipboard()).toBeNull();
		});

		it('should return stored entry', async () => {
			await copyEntity('filament', { name: 'Basic' }, 'path');
			const result = getClipboard();
			expect(result).not.toBeNull();
			expect(result!.entityType).toBe('filament');
			expect(result!.data.name).toBe('Basic');
		});

		it('should return null for invalid JSON', () => {
			localStorage.setItem('ofd_clipboard', 'not json');
			expect(getClipboard()).toBeNull();
		});

		it('should return null for missing entityType', () => {
			localStorage.setItem('ofd_clipboard', JSON.stringify({ data: {} }));
			expect(getClipboard()).toBeNull();
		});
	});

	describe('hasCompatibleClipboard', () => {
		it('should return false when empty', () => {
			expect(hasCompatibleClipboard('brand')).toBe(false);
		});

		it('should return true for matching type', async () => {
			await copyEntity('brand', { name: 'Test' }, 'path');
			expect(hasCompatibleClipboard('brand')).toBe(true);
		});

		it('should return false for mismatched type', async () => {
			await copyEntity('brand', { name: 'Test' }, 'path');
			expect(hasCompatibleClipboard('material')).toBe(false);
			expect(hasCompatibleClipboard('filament')).toBe(false);
			expect(hasCompatibleClipboard('variant')).toBe(false);
			expect(hasCompatibleClipboard('store')).toBe(false);
		});
	});

	describe('clearClipboard', () => {
		it('should remove entry from localStorage', async () => {
			await copyEntity('brand', { name: 'Test' }, 'path');
			expect(getClipboard()).not.toBeNull();
			clearClipboard();
			expect(getClipboard()).toBeNull();
		});
	});

	describe('prepareDuplicateData', () => {
		it('should clear id and slug for all types', () => {
			const data = { id: '123', slug: 'test', name: 'Test' };
			const result = prepareDuplicateData('brand', data);
			expect(result.id).toBeUndefined();
			expect(result.slug).toBeUndefined();
		});

		it('should clear brandId and filamentDir', () => {
			const data = { id: '1', name: 'Test', brandId: 'b1', filamentDir: '/path' };
			const result = prepareDuplicateData('filament', data);
			expect(result.brandId).toBeUndefined();
			expect(result.filamentDir).toBeUndefined();
		});

		it('should append (Copy) to brand name', () => {
			const result = prepareDuplicateData('brand', { name: 'Bambu Lab' });
			expect(result.name).toBe('Bambu Lab (Copy)');
		});

		it('should append (Copy) to material name', () => {
			const result = prepareDuplicateData('material', { material: 'PLA', materialType: 'PLA' });
			expect(result.material).toBe('PLA (Copy)');
			expect(result.materialType).toBeUndefined();
		});

		it('should append (Copy) to filament name and keep materialType', () => {
			const data = { name: 'Basic', materialType: 'PLA' };
			const result = prepareDuplicateData('filament', data);
			expect(result.name).toBe('Basic (Copy)');
			expect(result.materialType).toBe('PLA');
		});

		it('should append (Copy) to variant name', () => {
			const result = prepareDuplicateData('variant', { name: 'Blue' });
			expect(result.name).toBe('Blue (Copy)');
		});

		it('should append (Copy) to store name and keep logo', () => {
			const result = prepareDuplicateData('store', { name: 'Amazon', logo: 'logo.png' });
			expect(result.name).toBe('Amazon (Copy)');
			expect(result.logo).toBe('logo.png');
		});

		it('should keep brand logo', () => {
			const result = prepareDuplicateData('brand', { name: 'Test', logo: 'logo.png' });
			expect(result.logo).toBe('logo.png');
		});

		it('should not mutate original data', () => {
			const data = { id: '1', name: 'Test', nested: { a: 1 } };
			prepareDuplicateData('brand', data);
			expect(data.id).toBe('1');
			expect(data.name).toBe('Test');
		});
	});

	describe('prepareEntityData', () => {
		it('without suffix keeps original name', () => {
			const result = prepareEntityData('brand', { name: 'Bambu Lab', id: 'x' });
			expect(result.name).toBe('Bambu Lab');
			expect(result.id).toBeUndefined();
		});

		it('with suffix appends to name', () => {
			const result = prepareEntityData('brand', { name: 'Bambu Lab' }, ' (Copy)');
			expect(result.name).toBe('Bambu Lab (Copy)');
		});

		it('prepareDuplicateData delegates to prepareEntityData', () => {
			const dup = prepareDuplicateData('filament', { name: 'Basic', id: '1' });
			const manual = prepareEntityData('filament', { name: 'Basic', id: '1' }, ' (Copy)');
			expect(dup).toEqual(manual);
		});
	});

	describe('field preservation (no silent data loss)', () => {
		it('preserves all filament data fields', () => {
			const filament = {
				id: 'basic',
				slug: 'basic',
				name: 'Basic',
				diameter_tolerance: 0.02,
				density: 1.24,
				shore_hardness_a: 95,
				shore_hardness_d: 55,
				certifications: ['food-safe'],
				max_dry_temperature: 55,
				min_print_temperature: 190,
				max_print_temperature: 220,
				preheat_temperature: 170,
				min_bed_temperature: 50,
				max_bed_temperature: 70,
				min_nozzle_diameter: 0.4,
				data_sheet_url: 'https://example.com/ds',
				safety_sheet_url: 'https://example.com/sds',
				discontinued: false,
				slicer_settings: { generic: { bed_temp: 60 } },
				materialType: 'PLA',
				brandId: 'bambu',
				filamentDir: '/some/path'
			};
			const result = prepareEntityData('filament', filament);

			// Identity fields stripped
			expect(result.id).toBeUndefined();
			expect(result.slug).toBeUndefined();
			expect(result.brandId).toBeUndefined();
			expect(result.filamentDir).toBeUndefined();

			// ALL data fields preserved
			expect(result.name).toBe('Basic');
			expect(result.diameter_tolerance).toBe(0.02);
			expect(result.density).toBe(1.24);
			expect(result.shore_hardness_a).toBe(95);
			expect(result.shore_hardness_d).toBe(55);
			expect(result.certifications).toEqual(['food-safe']);
			expect(result.max_dry_temperature).toBe(55);
			expect(result.min_print_temperature).toBe(190);
			expect(result.max_print_temperature).toBe(220);
			expect(result.preheat_temperature).toBe(170);
			expect(result.min_bed_temperature).toBe(50);
			expect(result.max_bed_temperature).toBe(70);
			expect(result.min_nozzle_diameter).toBe(0.4);
			expect(result.data_sheet_url).toBe('https://example.com/ds');
			expect(result.safety_sheet_url).toBe('https://example.com/sds');
			expect(result.discontinued).toBe(false);
			expect(result.slicer_settings).toEqual({ generic: { bed_temp: 60 } });
			expect(result.materialType).toBe('PLA');
		});

		it('preserves all variant data fields', () => {
			const variant = {
				id: 'blue',
				slug: 'blue',
				name: 'Blue',
				color_hex: '#0000FF',
				discontinued: false,
				filament_id: 'basic',
				traits: { translucent: true, matte: false },
				sizes: [{ filament_weight: 1000, diameter: 1.75 }]
			};
			const result = prepareEntityData('variant', variant);

			expect(result.id).toBeUndefined();
			expect(result.slug).toBeUndefined();
			expect(result.name).toBe('Blue');
			expect(result.color_hex).toBe('#0000FF');
			expect(result.discontinued).toBe(false);
			expect(result.filament_id).toBe('basic');
			expect(result.traits).toEqual({ translucent: true, matte: false });
			expect(result.sizes).toEqual([{ filament_weight: 1000, diameter: 1.75 }]);
		});

		it('preserves all brand data fields', () => {
			const brand = {
				id: 'bambu', slug: 'bambu', name: 'Bambu Lab',
				website: 'https://bambulab.com', logo: 'logo.png', origin: 'CN'
			};
			const result = prepareEntityData('brand', brand);
			expect(result.id).toBeUndefined();
			expect(result.slug).toBeUndefined();
			expect(result.name).toBe('Bambu Lab');
			expect(result.website).toBe('https://bambulab.com');
			expect(result.logo).toBe('logo.png');
			expect(result.origin).toBe('CN');
		});

		it('preserves all store data fields', () => {
			const store = {
				id: 'amazon', slug: 'amazon', name: 'Amazon',
				storefront_url: 'https://amazon.com', logo: 'logo.png',
				ships_from: ['US', 'DE'], ships_to: ['US', 'DE', 'GB']
			};
			const result = prepareEntityData('store', store);
			expect(result.id).toBeUndefined();
			expect(result.slug).toBeUndefined();
			expect(result.name).toBe('Amazon');
			expect(result.storefront_url).toBe('https://amazon.com');
			expect(result.logo).toBe('logo.png');
			expect(result.ships_from).toEqual(['US', 'DE']);
			expect(result.ships_to).toEqual(['US', 'DE', 'GB']);
		});

		it('preserves all material data fields', () => {
			const material = {
				id: 'PLA', materialType: 'PLA', material: 'PLA',
				material_class: 'FFF', default_max_dry_temperature: 45,
				default_slicer_settings: { generic: { bed_temp: 60 } }
			};
			const result = prepareEntityData('material', material);
			expect(result.id).toBeUndefined();
			expect(result.materialType).toBeUndefined();
			expect(result.material).toBe('PLA');
			expect(result.material_class).toBe('FFF');
			expect(result.default_max_dry_temperature).toBe(45);
			expect(result.default_slicer_settings).toEqual({ generic: { bed_temp: 60 } });
		});

		it('preserves unknown/future fields by default', () => {
			const data = { id: '1', name: 'Test', some_future_field: 'value', another_new_field: 42 };
			const result = prepareEntityData('brand', data);
			expect(result.some_future_field).toBe('value');
			expect(result.another_new_field).toBe(42);
		});
	});
});
