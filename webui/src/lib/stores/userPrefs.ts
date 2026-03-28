import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { STORAGE_KEY_USER_PREFS } from '$lib/config/storageKeys';

export interface SubmissionRecord {
	uuid: string;
	prUrl: string;
	prNumber: number;
	submittedAt: string;
}

export interface UserPrefs {
	submissionUuids: SubmissionRecord[];
}
const MAX_SUBMISSIONS = 50;

function loadPrefs(): UserPrefs {
	const defaults: UserPrefs = {
		submissionUuids: []
	};

	if (!browser) return defaults;

	try {
		const stored = localStorage.getItem(STORAGE_KEY_USER_PREFS);
		if (stored) {
			const parsed = JSON.parse(stored);
			return { ...defaults, ...parsed };
		}
	} catch {
		// Corrupt data, use defaults
	}

	return defaults;
}

function savePrefs(prefs: UserPrefs): void {
	if (!browser) return;
	try {
		localStorage.setItem(STORAGE_KEY_USER_PREFS, JSON.stringify(prefs));
	} catch {
		// Storage full or unavailable
	}
}

function createUserPrefsStore() {
	const { subscribe, update, set } = writable<UserPrefs>(loadPrefs());

	// Auto-save on change
	subscribe((prefs) => {
		savePrefs(prefs);
	});

	return {
		subscribe,
		set,
		update,

		addSubmission(uuid: string, prUrl: string, prNumber: number) {
			update((p) => {
				const record: SubmissionRecord = {
					uuid,
					prUrl,
					prNumber,
					submittedAt: new Date().toISOString()
				};
				const updated = [record, ...p.submissionUuids].slice(0, MAX_SUBMISSIONS);
				return { ...p, submissionUuids: updated };
			});
		},

		getSubmissions(): SubmissionRecord[] {
			let result: SubmissionRecord[] = [];
			subscribe((p) => {
				result = p.submissionUuids;
			})();
			return result;
		}
	};
}

export const userPrefs = createUserPrefsStore();
