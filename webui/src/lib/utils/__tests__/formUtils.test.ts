import { describe, it, expect } from 'vitest';
import { buildOptionalFields, buildSubmitData } from '../formUtils';

describe('formUtils', () => {
	describe('buildOptionalFields', () => {
		it('should return empty object when all values are empty/null/undefined', () => {
			const source = { a: '', b: null, c: undefined };
			expect(buildOptionalFields(source, ['a', 'b', 'c'])).toEqual({});
		});

		it('should include fields with truthy values', () => {
			const source = { name: 'Test', website: 'https://example.com' };
			expect(buildOptionalFields(source, ['name', 'website'])).toEqual({
				name: 'Test',
				website: 'https://example.com'
			});
		});

		it('should exclude empty arrays', () => {
			const source = { tags: [], name: 'Test' };
			expect(buildOptionalFields(source, ['tags', 'name'])).toEqual({ name: 'Test' });
		});

		it('should include non-empty arrays', () => {
			const source = { tags: ['a', 'b'] };
			expect(buildOptionalFields(source, ['tags'])).toEqual({ tags: ['a', 'b'] });
		});

		it('should handle mixed present and absent fields', () => {
			const source = { name: 'Test', website: '', tags: ['a'], desc: null };
			expect(buildOptionalFields(source, ['name', 'website', 'tags', 'desc'])).toEqual({
				name: 'Test',
				tags: ['a']
			});
		});

		it('should only process fields listed in optionalFields', () => {
			const source = { name: 'Test', secret: 'hidden' };
			expect(buildOptionalFields(source, ['name'])).toEqual({ name: 'Test' });
		});

		it('should preserve numeric zero values', () => {
			const source = { count: 0 };
			expect(buildOptionalFields(source, ['count'])).toEqual({ count: 0 });
		});

		it('should preserve boolean false values', () => {
			const source = { active: false };
			expect(buildOptionalFields(source, ['active'])).toEqual({ active: false });
		});
	});

	describe('buildSubmitData', () => {
		it('should always include required fields even when empty', () => {
			const source = { name: '', id: 'test' };
			expect(buildSubmitData(source, ['name', 'id'], [])).toEqual({ name: '', id: 'test' });
		});

		it('should merge optional fields that have values', () => {
			const source = { name: 'Test', website: 'https://example.com', desc: '' };
			expect(buildSubmitData(source, ['name'], ['website', 'desc'])).toEqual({
				name: 'Test',
				website: 'https://example.com'
			});
		});

		it('should not include optional fields that are empty', () => {
			const source = { name: 'Test', website: '', tags: [] };
			expect(buildSubmitData(source, ['name'], ['website', 'tags'])).toEqual({
				name: 'Test'
			});
		});

		it('should handle no optional fields', () => {
			const source = { name: 'Test', id: 'foo' };
			expect(buildSubmitData(source, ['name', 'id'], [])).toEqual({ name: 'Test', id: 'foo' });
		});

		it('should handle no required fields', () => {
			const source = { website: 'https://example.com' };
			expect(buildSubmitData(source, [], ['website'])).toEqual({ website: 'https://example.com' });
		});

		it('should include required fields even when undefined', () => {
			const source = { name: undefined as unknown as string };
			expect(buildSubmitData(source, ['name'], [])).toEqual({ name: undefined });
		});
	});
});
