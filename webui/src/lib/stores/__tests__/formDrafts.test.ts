/**
 * Tests for the in-memory form draft store.
 *
 * The draft store is deliberately not persisted to localStorage — it only
 * needs to survive across modal close/reopen during a single page-load.
 * Important invariant: writes are deep-cloned so callers can pass
 * Svelte 5 proxy state without leaking the proxy reference.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { formDrafts } from '../formDrafts';

describe('formDrafts', () => {
	beforeEach(() => {
		// Defensive: clear any leftover state from previous tests
		formDrafts.clear('test');
		formDrafts.clear('form-1');
		formDrafts.clear('form-2');
		formDrafts.clear('brand-create');
	});

	it('set and get round-trip simple values', () => {
		formDrafts.set('test', { name: 'Acme', website: 'acme.com' });
		expect(formDrafts.get('test')).toEqual({ name: 'Acme', website: 'acme.com' });
	});

	it('has reports presence accurately', () => {
		expect(formDrafts.has('test')).toBe(false);
		formDrafts.set('test', { foo: 'bar' });
		expect(formDrafts.has('test')).toBe(true);
		formDrafts.clear('test');
		expect(formDrafts.has('test')).toBe(false);
	});

	it('clear removes only the specified key', () => {
		formDrafts.set('form-1', { name: 'A' });
		formDrafts.set('form-2', { name: 'B' });
		formDrafts.clear('form-1');
		expect(formDrafts.has('form-1')).toBe(false);
		expect(formDrafts.get('form-2')).toEqual({ name: 'B' });
	});

	it('get returns undefined for unknown keys', () => {
		expect(formDrafts.get('nonexistent')).toBeUndefined();
	});

	it('set deep-clones the input so external mutations do not leak in', () => {
		const original = { name: 'Acme', nested: { value: 1 } };
		formDrafts.set('test', original);

		original.name = 'Changed';
		original.nested.value = 999;

		const retrieved = formDrafts.get<typeof original>('test')!;
		expect(retrieved.name).toBe('Acme');
		expect(retrieved.nested.value).toBe(1);
	});

	it('set overwrites previous values for the same key', () => {
		formDrafts.set('test', { v: 1 });
		formDrafts.set('test', { v: 2 });
		expect(formDrafts.get('test')).toEqual({ v: 2 });
	});

	it('handles arrays and primitives', () => {
		formDrafts.set('test', [1, 2, 3]);
		expect(formDrafts.get('test')).toEqual([1, 2, 3]);

		formDrafts.set('test', 'a string');
		expect(formDrafts.get('test')).toBe('a string');

		formDrafts.set('test', 42);
		expect(formDrafts.get('test')).toBe(42);
	});

	it('typed get<T> casts the returned value (compile-time only)', () => {
		interface BrandDraft {
			name: string;
		}
		formDrafts.set('brand-create', { name: 'Acme' });
		const draft = formDrafts.get<BrandDraft>('brand-create');
		expect(draft?.name).toBe('Acme');
	});
});
