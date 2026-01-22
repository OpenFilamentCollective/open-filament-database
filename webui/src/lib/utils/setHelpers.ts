/**
 * Toggles an item in a Set, returning a new Set.
 * If the item exists, it's removed. If it doesn't exist, it's added.
 *
 * @param set - The original Set
 * @param item - The item to toggle
 * @returns A new Set with the item toggled
 *
 * @example
 * ```typescript
 * let selectedTraits = $state(new Set(['trait1']));
 *
 * function toggleTrait(key: string) {
 *   selectedTraits = toggleSetItem(selectedTraits, key);
 * }
 * ```
 */
export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
	const newSet = new Set(set);
	if (newSet.has(item)) {
		newSet.delete(item);
	} else {
		newSet.add(item);
	}
	return newSet;
}

/**
 * Adds an item to a Set, returning a new Set.
 *
 * @param set - The original Set
 * @param item - The item to add
 * @returns A new Set with the item added
 */
export function addToSet<T>(set: Set<T>, item: T): Set<T> {
	const newSet = new Set(set);
	newSet.add(item);
	return newSet;
}

/**
 * Removes an item from a Set, returning a new Set.
 *
 * @param set - The original Set
 * @param item - The item to remove
 * @returns A new Set with the item removed
 */
export function removeFromSet<T>(set: Set<T>, item: T): Set<T> {
	const newSet = new Set(set);
	newSet.delete(item);
	return newSet;
}
