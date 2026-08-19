/**
 * Tests for the delete-flow composable.
 *
 * One modal per page serves both the page's own entity and every child card, so
 * the contracts worth locking are the ones that differ per request: child-card
 * deletes must never navigate, and the page's list must be pruned before any
 * navigation happens.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	goto: vi.fn(),
	redirectAndDelete: vi.fn(),
	isLocallyCreated: vi.fn(() => false),
	get: vi.fn()
}));

// The sveltekit plugin resolves $app/navigation to the real client runtime, which
// throws outside a browser — mock it by specifier.
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));

vi.mock('$lib/services/redirectService', () => ({
	redirectAndDelete: mocks.redirectAndDelete
}));

vi.mock('$lib/services/entityService', () => ({
	isLocallyCreated: mocks.isLocallyCreated
}));

vi.mock('$lib/services/entityRegistry', () => ({
	entityOps: {
		brand: { label: 'Brand', cascadeWarning: 'brand cascade' },
		material: { label: 'Material', cascadeWarning: 'material cascade' },
		filament: { label: 'Filament', cascadeWarning: 'filament cascade' },
		variant: { label: 'Variant' },
		store: { label: 'Store' }
	},
	opsForPath: (path: string) => ({ ep: { type: 'filament', path }, ops: { get: mocks.get } })
}));

import { createDeleteFlow } from '../useDeleteFlow.svelte';

function messageHandlerStub() {
	return {
		message: null,
		type: 'info' as const,
		showSuccess: vi.fn(),
		showError: vi.fn(),
		showInfo: vi.fn(),
		clear: vi.fn()
	};
}

const FILAMENT_REQUEST = {
	type: 'filament' as const,
	path: 'brands/acme/materials/PLA/filaments/gone',
	label: 'Filament',
	name: 'Gone',
	uuid: 'u-1',
	deleteFn: vi.fn(async () => true)
};

const TARGET = {
	path: 'brands/acme/materials/PLA/filaments/keep',
	name: 'Keep',
	href: '/brands/acme/PLA/keep'
};

describe('useDeleteFlow', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.isLocallyCreated.mockReturnValue(false);
		mocks.get.mockResolvedValue(null);
		mocks.redirectAndDelete.mockResolvedValue({ success: true, message: 'marked for deletion' });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('opens and closes around a single request', () => {
		const flow = createDeleteFlow(messageHandlerStub());
		expect(flow.show).toBe(false);

		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: '/brands/acme/PLA' });
		expect(flow.show).toBe(true);
		expect(flow.source?.name).toBe('Gone');
		expect(flow.cascadeWarning).toBe('filament cascade');

		flow.close();
		expect(flow.show).toBe(false);
		expect(flow.source).toBeNull();
	});

	it('captures isLocalCreate from the request path, not the page', () => {
		const flow = createDeleteFlow(messageHandlerStub());
		mocks.isLocallyCreated.mockReturnValue(true);

		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: null });

		expect(mocks.isLocallyCreated).toHaveBeenCalledWith(FILAMENT_REQUEST.path);
		expect(flow.isLocalCreate).toBe(true);
	});

	it('lets a request override the registry cascade warning', () => {
		const flow = createDeleteFlow(messageHandlerStub());
		flow.open({ ...FILAMENT_REQUEST, cascadeWarning: 'custom', navigateOnDelete: null });
		expect(flow.cascadeWarning).toBe('custom');
	});

	it('navigates to the parent after a plain delete on a detail page', async () => {
		const messageHandler = messageHandlerStub();
		const flow = createDeleteFlow(messageHandler);
		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: '/brands/acme/PLA' });

		await flow.confirm(null);

		expect(mocks.redirectAndDelete).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Gone' }),
			null
		);
		expect(flow.show).toBe(false);
		expect(messageHandler.showSuccess).toHaveBeenCalledWith('marked for deletion');
		vi.runAllTimers();
		expect(mocks.goto).toHaveBeenCalledWith('/brands/acme/PLA');
	});

	it('navigates to the replacement after a redirect, not to the parent', async () => {
		const messageHandler = messageHandlerStub();
		const flow = createDeleteFlow(messageHandler);
		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: '/brands/acme/PLA' });

		await flow.confirm(TARGET);

		expect(messageHandler.showSuccess).toHaveBeenCalledWith(
			'Redirected "Gone" → "Keep". marked for deletion'
		);
		vi.runAllTimers();
		expect(mocks.goto).toHaveBeenCalledWith(TARGET.href);
	});

	it('never navigates for a child card, and prunes the list first', async () => {
		const order: string[] = [];
		const flow = createDeleteFlow(messageHandlerStub());
		flow.open({
			...FILAMENT_REQUEST,
			navigateOnDelete: null,
			onSuccess: () => order.push('prune')
		});

		await flow.confirm(TARGET);
		vi.runAllTimers();

		expect(order).toEqual(['prune']);
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(flow.show).toBe(false);
	});

	it('keeps the modal open and reports failures inside it', async () => {
		const messageHandler = messageHandlerStub();
		mocks.redirectAndDelete.mockResolvedValue({ success: false, message: 'target gone' });
		const onSuccess = vi.fn();
		const flow = createDeleteFlow(messageHandler);
		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: '/brands/acme/PLA', onSuccess });

		await flow.confirm(TARGET);
		vi.runAllTimers();

		expect(flow.show).toBe(true);
		expect(flow.error).toBe('target gone');
		expect(flow.busy).toBe(false);
		expect(onSuccess).not.toHaveBeenCalled();
		expect(mocks.goto).not.toHaveBeenCalled();
		expect(messageHandler.showSuccess).not.toHaveBeenCalled();
	});

	it('surfaces thrown errors in the modal too', async () => {
		mocks.redirectAndDelete.mockRejectedValue(new Error('network down'));
		const flow = createDeleteFlow(messageHandlerStub());
		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: null });

		await flow.confirm(null);

		expect(flow.error).toBe('network down');
		expect(flow.show).toBe(true);
	});

	// List endpoints serve trimmed summaries, so a child card's entity has no `uuid`
	// and the modal would otherwise claim the entry has no canonical identity.
	it('looks up the identity a child card could not supply', async () => {
		const flow = createDeleteFlow(messageHandlerStub());
		let resolve: (v: unknown) => void = () => {};
		mocks.get.mockReturnValue(new Promise((r) => (resolve = r)));

		flow.open({ ...FILAMENT_REQUEST, uuid: undefined, navigateOnDelete: null });
		expect(flow.resolving).toBe(true);
		expect(flow.source?.uuid).toBeUndefined();

		resolve({ uuid: 'u-9', moved_from: ['u-8'] });
		await vi.waitFor(() => expect(flow.resolving).toBe(false));
		expect(flow.source?.uuid).toBe('u-9');
		expect(flow.source?.movedFrom).toEqual(['u-8']);
	});

	it('skips the lookup when the request already knows, or nothing can be recorded', () => {
		const flow = createDeleteFlow(messageHandlerStub());

		flow.open({ ...FILAMENT_REQUEST, navigateOnDelete: null });
		expect(mocks.get).not.toHaveBeenCalled();
		expect(flow.resolving).toBe(false);

		mocks.isLocallyCreated.mockReturnValue(true);
		flow.open({ ...FILAMENT_REQUEST, uuid: undefined, navigateOnDelete: null });
		expect(mocks.get).not.toHaveBeenCalled();
	});

	it('drops a lookup that lands after the modal moved on', async () => {
		const flow = createDeleteFlow(messageHandlerStub());
		let resolveFirst: (v: unknown) => void = () => {};
		mocks.get.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));

		flow.open({ ...FILAMENT_REQUEST, uuid: undefined, name: 'First', navigateOnDelete: null });
		flow.close();
		resolveFirst({ uuid: 'stale' });
		await vi.waitFor(() => expect(mocks.get).toHaveBeenCalled());

		expect(flow.show).toBe(false);
		expect(flow.resolving).toBe(false);
	});

	it('ignores confirm when nothing is open', async () => {
		const flow = createDeleteFlow(messageHandlerStub());
		await flow.confirm(null);
		expect(mocks.redirectAndDelete).not.toHaveBeenCalled();
	});
});
