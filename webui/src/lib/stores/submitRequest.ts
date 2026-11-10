/**
 * Lets any page open the Changes menu's submit dialog (validation, then the wizard), so
 * there is one way to submit. Bump it with `requestSubmit()`; ChangesMenu listens.
 */
import { writable } from 'svelte/store';

export const submitRequest = writable(0);

export function requestSubmit(): void {
	submitRequest.update((n) => n + 1);
}
