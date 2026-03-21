import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';

export interface LogEntry {
	level: 'log' | 'warn' | 'error' | 'info' | 'debug';
	args: string[];
	timestamp: number;
}

const MAX_ENTRIES = 200;

export const debugEnabled = env.PUBLIC_DEBUG === 'true';
export const debugLog = writable<LogEntry[]>([]);

if (browser && debugEnabled) {
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
				const next = [...entries, { level, args: serialized, timestamp: Date.now() }];
				return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
			});
		};
	}

	intercept('log');
	intercept('warn');
	intercept('error');
	intercept('info');
	intercept('debug');

	// Capture unhandled errors and promise rejections
	window.addEventListener('error', (e) => {
		const msg = e.error instanceof Error
			? `${e.error.name}: ${e.error.message}\n${e.error.stack ?? ''}`
			: String(e.message);
		debugLog.update((entries) => {
			const next = [...entries, { level: 'error' as const, args: [`[unhandled] ${msg}`], timestamp: Date.now() }];
			return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
		});
	});

	window.addEventListener('unhandledrejection', (e) => {
		const reason = e.reason instanceof Error
			? `${e.reason.name}: ${e.reason.message}\n${e.reason.stack ?? ''}`
			: String(e.reason);
		debugLog.update((entries) => {
			const next = [...entries, { level: 'error' as const, args: [`[unhandled rejection] ${reason}`], timestamp: Date.now() }];
			return next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next;
		});
	});
}
