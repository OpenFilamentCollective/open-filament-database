import { writable, derived } from 'svelte/store';

export interface ValidationError {
	level: 'ERROR' | 'WARNING';
	category: string;
	message: string;
	path: string | null;
}

export interface ValidationResult {
	errors: ValidationError[];
	error_count: number;
	warning_count: number;
	is_valid: boolean;
}

interface ValidationState {
	isValidating: boolean;
	lastValidation: Date | null;
	results: ValidationResult | null;
}

function createValidationStore() {
	const { subscribe, set, update } = writable<ValidationState>({
		isValidating: false,
		lastValidation: null,
		results: null
	});

	return {
		subscribe,
		setValidating: (isValidating: boolean) =>
			update((state) => ({
				...state,
				isValidating
			})),
		setResults: (results: ValidationResult) =>
			update((state) => ({
				...state,
				isValidating: false,
				lastValidation: new Date(),
				results
			})),
		clear: () =>
			set({
				isValidating: false,
				lastValidation: null,
				results: null
			})
	};
}

export const validationStore = createValidationStore();

// Derived stores for convenience
export const errorCount = derived(validationStore, ($store) => $store.results?.error_count ?? 0);

export const warningCount = derived(
	validationStore,
	($store) => $store.results?.warning_count ?? 0
);

export const errorsByCategory = derived(validationStore, ($store) => {
	if (!$store.results) return new Map<string, ValidationError[]>();

	const grouped = new Map<string, ValidationError[]>();
	for (const error of $store.results.errors) {
		if (!grouped.has(error.category)) {
			grouped.set(error.category, []);
		}
		grouped.get(error.category)!.push(error);
	}
	return grouped;
});
