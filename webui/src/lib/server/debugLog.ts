/**
 * Server-side debug log buffer.
 * Intercepts console.* from the moment this module is first imported
 * (hooks.server.ts) and keeps a ring buffer of entries in memory.
 * Exposed to the client via /api/debug/logs.
 */

export interface ServerLogEntry {
	source: 'server';
	level: 'log' | 'warn' | 'error' | 'info' | 'debug';
	args: string[];
	timestamp: number;
}

const MAX_ENTRIES = 500;
const entries: ServerLogEntry[] = [];
let installed = false;

function serialize(args: unknown[]): string[] {
	return args.map((a) => {
		if (a instanceof Error) return `${a.name}: ${a.message}\n${a.stack ?? ''}`;
		if (typeof a === 'object' && a !== null) {
			try {
				return JSON.stringify(a, null, 2);
			} catch {
				return String(a);
			}
		}
		return String(a);
	});
}

function push(level: ServerLogEntry['level'], args: string[]) {
	entries.push({ source: 'server', level, args, timestamp: Date.now() });
	if (entries.length > MAX_ENTRIES) {
		entries.splice(0, entries.length - MAX_ENTRIES);
	}
}

export function installServerLogCapture() {
	if (installed) return;
	installed = true;

	const orig = {
		log: console.log,
		warn: console.warn,
		error: console.error,
		info: console.info,
		debug: console.debug
	};

	for (const level of ['log', 'warn', 'error', 'info', 'debug'] as const) {
		const original = orig[level];
		console[level] = (...args: unknown[]) => {
			original.apply(console, args);
			push(level, serialize(args));
		};
	}

	process.on('uncaughtException', (err) => {
		push('error', [`[uncaughtException] ${err.name}: ${err.message}\n${err.stack ?? ''}`]);
	});

	process.on('unhandledRejection', (reason) => {
		const msg = reason instanceof Error
			? `${reason.name}: ${reason.message}\n${reason.stack ?? ''}`
			: String(reason);
		push('error', [`[unhandledRejection] ${msg}`]);
	});
}

/** Get all entries, optionally since a given timestamp */
export function getServerLogs(since?: number): ServerLogEntry[] {
	if (since) {
		return entries.filter((e) => e.timestamp > since);
	}
	return [...entries];
}
