/**
 * Tests for the shared entity action composables.
 *
 * These composables are the architectural seam between detail-page
 * dropdowns and list-view card menus — both must call exactly the same
 * logic for copy/duplicate/paste. CLAUDE.md flags this as a "never inline"
 * rule, so we lock the composable contracts here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks must be hoisted; declare via vi.hoisted so the factory closures can see them.
const mocks = vi.hoisted(() => {
	return {
		copyEntity: vi.fn(),
		getClipboard: vi.fn(),
		prepareDuplicateData: vi.fn(
			(_type: string, data: any) => ({ ...data, name: (data.name ?? data.id) + ' (Copy)', id: undefined })
		),
		prepareEntityData: vi.fn(
			(_type: string, data: any, suffix?: string) => ({
				...data,
				name: (data.name ?? data.id) + (suffix ?? ''),
				id: undefined
			})
		)
	};
});

vi.mock('$lib/services/clipboardService', () => ({
	copyEntity: mocks.copyEntity,
	getClipboard: mocks.getClipboard,
	prepareDuplicateData: mocks.prepareDuplicateData,
	prepareEntityData: mocks.prepareEntityData
}));

import {
	createCopyAction,
	createDuplicateAction,
	createPasteHandler
} from '../useEntityActions.svelte';

describe('useEntityActions', () => {
	beforeEach(() => {
		mocks.copyEntity.mockReset();
		mocks.getClipboard.mockReset();
		mocks.prepareDuplicateData.mockClear();
		mocks.prepareEntityData.mockClear();
	});

	describe('createCopyAction', () => {
		it('copies immediately when no loadChildrenFn is provided', () => {
			const action = createCopyAction('store');
			expect(action.showOptions).toBe(false);

			action.request({ id: 'shop', name: 'Shop' }, 'stores/shop');

			expect(mocks.copyEntity).toHaveBeenCalledWith('store', { id: 'shop', name: 'Shop' }, 'stores/shop');
			expect(action.showOptions).toBe(false);
		});

		it('opens the options modal when loadChildrenFn is provided', () => {
			const loadChildren = vi.fn(async () => ({ materials: [] }));
			const action = createCopyAction('brand', loadChildren);

			action.request({ id: 'acme', name: 'Acme' }, 'brands/acme');

			expect(mocks.copyEntity).not.toHaveBeenCalled();
			expect(action.showOptions).toBe(true);
		});

		it('select("with-children") loads children and copies with them', async () => {
			const loadChildren = vi.fn(async () => ({
				materials: [{ id: 'pla', material: 'PLA' }]
			}));
			const action = createCopyAction('brand', loadChildren);

			action.request({ id: 'acme', name: 'Acme' }, 'brands/acme');
			await action.select('with-children');

			expect(loadChildren).toHaveBeenCalledWith(
				{ id: 'acme', name: 'Acme' },
				'brands/acme'
			);
			expect(mocks.copyEntity).toHaveBeenCalledWith(
				'brand',
				{ id: 'acme', name: 'Acme' },
				'brands/acme',
				{ materials: [{ id: 'pla', material: 'PLA' }] }
			);
			expect(action.showOptions).toBe(false);
		});

		it('select("without-children") copies without loading children', async () => {
			const loadChildren = vi.fn();
			const action = createCopyAction('brand', loadChildren);

			action.request({ id: 'acme' }, 'brands/acme');
			await action.select('without-children');

			expect(loadChildren).not.toHaveBeenCalled();
			expect(mocks.copyEntity).toHaveBeenCalledWith(
				'brand',
				{ id: 'acme' },
				'brands/acme'
			);
			expect(action.showOptions).toBe(false);
		});

		it('close() closes the modal without copying', async () => {
			const loadChildren = vi.fn();
			const action = createCopyAction('brand', loadChildren);
			action.request({ id: 'acme' }, 'brands/acme');
			expect(action.showOptions).toBe(true);

			action.close();

			expect(action.showOptions).toBe(false);
			expect(mocks.copyEntity).not.toHaveBeenCalled();
		});

		it('select() is a no-op when no request was made', async () => {
			const loadChildren = vi.fn();
			const action = createCopyAction('brand', loadChildren);
			await action.select('with-children');
			expect(mocks.copyEntity).not.toHaveBeenCalled();
			expect(loadChildren).not.toHaveBeenCalled();
		});

		it('back-to-back requests use the latest pending data', async () => {
			const loadChildren = vi.fn(async () => ({}));
			const action = createCopyAction('brand', loadChildren);

			action.request({ id: 'first' }, 'brands/first');
			action.request({ id: 'second' }, 'brands/second');
			await action.select('without-children');

			expect(mocks.copyEntity).toHaveBeenCalledTimes(1);
			expect(mocks.copyEntity).toHaveBeenCalledWith('brand', { id: 'second' }, 'brands/second');
		});
	});

	describe('createDuplicateAction', () => {
		it('opens the form immediately when hasChildren is false', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('store', false, openForm);

			action.request({ id: 'shop', name: 'Shop' });

			expect(mocks.prepareDuplicateData).toHaveBeenCalledWith('store', { id: 'shop', name: 'Shop' });
			expect(openForm).toHaveBeenCalledTimes(1);
			expect(openForm.mock.calls[0][0].name).toBe('Shop (Copy)');
			expect(action.showOptions).toBe(false);
		});

		it('opens the options modal when hasChildren is true', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('brand', true, openForm);

			action.request({ id: 'acme', name: 'Acme' });

			expect(action.showOptions).toBe(true);
			expect(openForm).not.toHaveBeenCalled();
		});

		it('select("with-children") sets withChildren and opens form', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('brand', true, openForm);

			action.request({ id: 'acme', name: 'Acme' });
			action.select('with-children');

			expect(action.withChildren).toBe(true);
			expect(action.showOptions).toBe(false);
			expect(openForm).toHaveBeenCalledTimes(1);
			expect(openForm.mock.calls[0][0].name).toBe('Acme (Copy)');
		});

		it('select("without-children") opens form without withChildren', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('brand', true, openForm);

			action.request({ id: 'acme', name: 'Acme' });
			action.select('without-children');

			expect(action.withChildren).toBe(false);
			expect(action.showOptions).toBe(false);
			expect(openForm).toHaveBeenCalledTimes(1);
		});

		it('close() closes without opening the form', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('brand', true, openForm);
			action.request({ id: 'acme' });
			action.close();
			expect(action.showOptions).toBe(false);
			expect(openForm).not.toHaveBeenCalled();
		});

		it('does not open the form twice for the same request', () => {
			const openForm = vi.fn();
			const action = createDuplicateAction('brand', true, openForm);

			action.request({ id: 'acme', name: 'Acme' });
			action.select('with-children');
			action.select('with-children'); // second click

			expect(openForm).toHaveBeenCalledTimes(1);
		});
	});

	describe('createPasteHandler', () => {
		it('opens form with raw clipboard data when no conflict exists', () => {
			const openForm = vi.fn();
			mocks.getClipboard.mockReturnValue({
				entityType: 'brand',
				data: { id: 'acme', name: 'Acme' }
			});
			const paste = createPasteHandler('brand', openForm, () => false);

			paste();

			expect(mocks.prepareEntityData).toHaveBeenCalledWith(
				'brand',
				{ id: 'acme', name: 'Acme' },
				undefined
			);
			expect(openForm).toHaveBeenCalledTimes(1);
			expect(openForm.mock.calls[0][0].name).toBe('Acme');
		});

		it('appends "(Copy)" when a name conflict is detected', () => {
			const openForm = vi.fn();
			mocks.getClipboard.mockReturnValue({
				entityType: 'brand',
				data: { id: 'acme', name: 'Acme' }
			});
			const paste = createPasteHandler('brand', openForm, () => true);

			paste();

			expect(mocks.prepareEntityData).toHaveBeenCalledWith(
				'brand',
				{ id: 'acme', name: 'Acme' },
				' (Copy)'
			);
			expect(openForm.mock.calls[0][0].name).toBe('Acme (Copy)');
		});

		it('passes the raw clipboard data (not prepared) to hasConflict', () => {
			const openForm = vi.fn();
			const hasConflict = vi.fn(() => false);
			mocks.getClipboard.mockReturnValue({
				entityType: 'brand',
				data: { id: 'acme', name: 'Acme' }
			});
			const paste = createPasteHandler('brand', openForm, hasConflict);
			paste();
			expect(hasConflict).toHaveBeenCalledWith({ id: 'acme', name: 'Acme' });
		});

		it('no-ops when clipboard is empty', () => {
			const openForm = vi.fn();
			mocks.getClipboard.mockReturnValue(null);
			const paste = createPasteHandler('brand', openForm);
			paste();
			expect(openForm).not.toHaveBeenCalled();
		});

		it('no-ops when clipboard contains a different entity type', () => {
			const openForm = vi.fn();
			mocks.getClipboard.mockReturnValue({
				entityType: 'store',
				data: { id: 'shop' }
			});
			const paste = createPasteHandler('brand', openForm);
			paste();
			expect(openForm).not.toHaveBeenCalled();
		});

		it('works without a hasConflict callback (defaults to no conflict)', () => {
			const openForm = vi.fn();
			mocks.getClipboard.mockReturnValue({
				entityType: 'brand',
				data: { id: 'acme', name: 'Acme' }
			});
			const paste = createPasteHandler('brand', openForm);
			paste();
			expect(mocks.prepareEntityData).toHaveBeenCalledWith(
				'brand',
				{ id: 'acme', name: 'Acme' },
				undefined
			);
		});
	});
});
