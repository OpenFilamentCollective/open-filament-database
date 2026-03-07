import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface SubmissionRecord {
	uuid: string;
	prUrl: string;
	prNumber: number;
	submittedAt: string;
}

export interface UserPrefs {
	submissionUuids: SubmissionRecord[];
	wantCredit: boolean;
	preferGitHub: boolean;
}

const STORAGE_KEY = 'ofd_user_prefs';
const MAX_SUBMISSIONS = 50;

function loadPrefs(): UserPrefs {
	const defaults: UserPrefs = {
		submissionUuids: [],
		wantCredit: false,
		preferGitHub: false
	};

	if (!browser) return defaults;

	try {
		const stored = localStorage.getItem(STORAGE_KEY);
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
		localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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

		setWantCredit(wantCredit: boolean) {
			update((p) => ({ ...p, wantCredit }));
		},

		setPreferGitHub(preferGitHub: boolean) {
			update((p) => ({ ...p, preferGitHub }));
		},

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
