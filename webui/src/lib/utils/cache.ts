/**
 * Cache utility with TTL (Time-To-Live) support
 * Provides transparent caching for API responses with configurable expiration
 */

import { env } from '$env/dynamic/public';

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // milliseconds
}

export interface CacheOptions {
	/** Time-to-live in milliseconds */
	ttl: number;
}

/** Common TTL presets (in milliseconds) */
export const TTL = {
	/** 1 minute */
	ONE_MINUTE: 60 * 1000,
	/** 5 minutes */
	FIVE_MINUTES: 5 * 60 * 1000,
	/** 15 minutes */
	FIFTEEN_MINUTES: 15 * 60 * 1000,
	/** 1 hour */
	ONE_HOUR: 60 * 60 * 1000,
	/** 6 hours */
	SIX_HOURS: 6 * 60 * 60 * 1000,
	/** 1 day */
	ONE_DAY: 24 * 60 * 60 * 1000,
	/** 1 week */
	ONE_WEEK: 7 * 24 * 60 * 60 * 1000,
	/** No expiration (must be manually invalidated) */
	NEVER: Infinity
} as const;

/**
 * Parse environment variable to milliseconds (env vars are in seconds)
 */
function envToMs(envVar: string | undefined, defaultMs: number): number {
	if (!envVar) return defaultMs;
	const seconds = parseInt(envVar, 10);
	if (isNaN(seconds)) return defaultMs;
	return seconds * 1000;
}

/**
 * Check if caching is enabled via environment variable
 */
export function isCacheEnabled(): boolean {
	return env.PUBLIC_CACHE_ENABLED !== 'false';
}

/**
 * Get configured TTL values from environment variables
 */
export function getConfiguredTTL() {
	return {
		default: envToMs(env.PUBLIC_CACHE_TTL_DEFAULT, TTL.FIVE_MINUTES),
		schemas: envToMs(env.PUBLIC_CACHE_TTL_SCHEMAS, TTL.ONE_DAY),
		index: envToMs(env.PUBLIC_CACHE_TTL_INDEX, TTL.FIVE_MINUTES),
		entity: envToMs(env.PUBLIC_CACHE_TTL_ENTITY, TTL.FIFTEEN_MINUTES)
	};
}

/**
 * In-memory cache with TTL support
 */
class Cache {
	private store = new Map<string, CacheEntry<any>>();

	/**
	 * Get a cached value if it exists and hasn't expired
	 * @param key - Cache key
	 * @returns The cached data or null if not found/expired
	 */
	get<T>(key: string): T | null {
		const entry = this.store.get(key);

		if (!entry) {
			return null;
		}

		// Check if expired
		if (this.isExpired(entry)) {
			this.store.delete(key);
			return null;
		}

		return entry.data as T;
	}

	/**
	 * Store a value in the cache with a TTL
	 * @param key - Cache key
	 * @param data - Data to cache
	 * @param options - Cache options including TTL
	 */
	set<T>(key: string, data: T, options: CacheOptions): void {
		const entry: CacheEntry<T> = {
			data,
			timestamp: Date.now(),
			ttl: options.ttl
		};
		this.store.set(key, entry);
	}

	/**
	 * Check if a cache entry has expired
	 */
	private isExpired(entry: CacheEntry<any>): boolean {
		if (entry.ttl === Infinity) {
			return false;
		}
		return Date.now() - entry.timestamp > entry.ttl;
	}

	/**
	 * Delete a specific cache entry
	 * @param key - Cache key to delete
	 */
	delete(key: string): boolean {
		return this.store.delete(key);
	}

	/**
	 * Delete all cache entries matching a prefix
	 * Useful for invalidating related entries (e.g., all brand data)
	 * @param prefix - Key prefix to match
	 */
	deleteByPrefix(prefix: string): number {
		let count = 0;
		for (const key of this.store.keys()) {
			if (key.startsWith(prefix)) {
				this.store.delete(key);
				count++;
			}
		}
		return count;
	}

	/**
	 * Clear all cached entries
	 */
	clear(): void {
		this.store.clear();
	}

	/**
	 * Get the number of cached entries
	 */
	get size(): number {
		return this.store.size;
	}

	/**
	 * Check if a key exists and is not expired
	 */
	has(key: string): boolean {
		return this.get(key) !== null;
	}

	/**
	 * Get cache entry metadata (for debugging)
	 */
	getMetadata(key: string): { timestamp: number; ttl: number; expiresAt: number; remainingMs: number } | null {
		const entry = this.store.get(key);
		if (!entry) return null;

		const expiresAt = entry.ttl === Infinity ? Infinity : entry.timestamp + entry.ttl;
		const remainingMs = entry.ttl === Infinity ? Infinity : Math.max(0, expiresAt - Date.now());

		return {
			timestamp: entry.timestamp,
			ttl: entry.ttl,
			expiresAt,
			remainingMs
		};
	}

	/**
	 * Remove all expired entries (garbage collection)
	 * Call periodically to free memory
	 */
	prune(): number {
		let count = 0;
		for (const [key, entry] of this.store.entries()) {
			if (this.isExpired(entry)) {
				this.store.delete(key);
				count++;
			}
		}
		return count;
	}
}

/** Singleton cache instance for API responses */
export const apiCache = new Cache();

/**
 * TTL configuration for different API endpoint patterns
 * More specific patterns should come first
 * Uses 'type' to reference configured TTL values
 */
const API_CACHE_PATTERNS: Array<{ pattern: RegExp; type: 'schemas' | 'index' | 'entity' }> = [
	// Schemas rarely change
	{ pattern: /^\/api\/schemas\//, type: 'schemas' },

	// Index endpoints (lists)
	{ pattern: /^\/api\/stores$/, type: 'index' },
	{ pattern: /^\/api\/brands$/, type: 'index' },

	// Individual entities
	{ pattern: /^\/api\/stores\/[^/]+$/, type: 'entity' },
	{ pattern: /^\/api\/brands\/[^/]+$/, type: 'entity' },

	// Nested resources (materials, filaments, variants)
	{ pattern: /^\/api\/brands\/[^/]+\/materials/, type: 'entity' },
];

/**
 * Get the TTL for a given API path based on configuration
 * Reads TTL values from environment variables
 * @param path - API path (e.g., '/api/brands')
 * @returns TTL in milliseconds
 */
export function getTTLForPath(path: string): number {
	const ttlConfig = getConfiguredTTL();

	for (const { pattern, type } of API_CACHE_PATTERNS) {
		if (pattern.test(path)) {
			return ttlConfig[type];
		}
	}

	return ttlConfig.default;
}
