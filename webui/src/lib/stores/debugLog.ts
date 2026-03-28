import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export interface LogEntry {
	source: 'client' | 'server';
	level: 'log' | 'warn' | 'error' | 'info' | 'debug';
	args: string[];
	timestamp: number;
}

const MAX_ENTRIES = 500;

export const debugEnabled = env.PUBLIC_DEBUG === 'true';
export const debugLog = writable<LogEntry[]>([]);

if (browser && debugEnabled) {
	// --- Client-side console interception ---
	const orig = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
		debug: console.debug
	};

	function intercept(level: LogEntry['level']) {
		const original = orig[level];
		console[level] = (...args: unknown[]) => {
			original.apply(console, args);
			const serialized = args.map((a) => {
				if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
				if (typeof a === 'object') {
					try {
						return JSON.stringify(a, null, 2);
					} catch {
						return String(a);
					}
				}
				return String(a);
			});
			debugLog.update((entries) => {
				const next = [...entries, { source: 'client' as const, level, args: serialized, timestamp: Date.now() }];
				return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
			});
		};
	}

	intercept('log');
	intercept('warn');
	intercept('error');
	intercept('info');
	intercept('debug');

	window.addEventListener('error', (e) => {
		const msg = e.error instanceof Error
			? `${e.error.name}: ${e.error.message}\n${e.error.stack ?? ''}`
			: String(e.message);
		debugLog.update((entries) => {
			const next = [...entries, { source: 'client' as const, level: 'error' as const, args: [`[unhandled] ${msg}`], timestamp: Date.now() }];
			return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
		});
	});

	window.addEventListener('unhandledrejection', (e) => {
		const reason = e.reason instanceof Error
			? `${e.reason.name}: ${e.reason.message}\n${e.reason.stack ?? ''}`
			: String(e.reason);
		debugLog.update((entries) => {
			const next = [...entries, { source: 'client' as const, level: 'error' as const, args: [`[unhandled rejection] ${reason}`], timestamp: Date.now() }];
			return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
		});
	});

	// --- Server log polling ---
	let lastServerTimestamp = 0;
	let polling = false;

	async function fetchServerLogs() {
		if (polling) return;
		polling = true;
		try {
			const url = lastServerTimestamp
				? `/api/debug?since=${lastServerTimestamp}`
				: '/api/debug';
			const res = await fetch(url);
			if (res.ok) {
				const serverEntries: LogEntry[] = await res.json();
				if (serverEntries.length > 0) {
					lastServerTimestamp = serverEntries[serverEntries.length - 1].timestamp;
					debugLog.update((current) => {
						const merged = [...current, ...serverEntries];
						merged.sort((a, b) => a.timestamp - b.timestamp);
						return merged.length > MAX_ENTRIES ? merged.slice(-MAX_ENTRIES) : merged;
					});
				}
			}
		} catch {
			// ignore fetch errors
		}
		polling = false;
	}

	// Initial fetch gets all logs since server start, then poll every 2s
	fetchServerLogs();
	setInterval(fetchServerLogs, 2000);
}
