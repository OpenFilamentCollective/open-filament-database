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
});
