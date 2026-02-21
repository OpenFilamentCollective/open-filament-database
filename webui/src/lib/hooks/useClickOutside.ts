/**
 * Creates a click outside handler that checks if clicks occur outside the given element refs.
 *
 * @param refs - Array of element references to check against
 * @param callback - Function to call when click is outside all refs
 * @returns Event handler function to attach to window click event
 *
 * @example
 * ```svelte
 * <script>
 *   import { useClickOutside } from '$lib/hooks/useClickOutside';
 *
 *   let containerRef = $state<HTMLDivElement | null>(null);
 *   let dropdownRef = $state<HTMLDivElement | null>(null);
 *   let isOpen = $state(false);
 *
 *   const handleClickOutside = useClickOutside(
 *     () => [containerRef, dropdownRef],
 *     () => { isOpen = false; }
 *   );
 * </script>
 *
 * <svelte:window onclick={handleClickOutside} />
 * ```
 */
export function useClickOutside(
	getRefs: () => Array<HTMLElement | null>,
	callback: () => void
): (event: MouseEvent) => void {
	return (event: MouseEvent) => {
		const refs = getRefs();
		const target = event.target as Node;
		const clickedInside = refs.some((ref) => ref?.contains(target));
		if (!clickedInside) {
			callback();
		}
	};
}
