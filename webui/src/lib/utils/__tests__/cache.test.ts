import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTL, isCacheEnabled, getConfiguredTTL, apiCache, getTTLForPath } from '../cache';

// Mock the dynamic environment import
vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_CACHE_ENABLED: 'true',
		PUBLIC_CACHE_TTL_DEFAULT: '300',
		PUBLIC_CACHE_TTL_SCHEMAS: '86400',
		PUBLIC_CACHE_TTL_INDEX: '300',
		PUBLIC_CACHE_TTL_ENTITY: '900'
	}
}));

describe('Cache Utils', () => {
	beforeEach(() => {
		apiCache.clear();
	});

	describe('TTL constants', () => {
		it('should have correct millisecond values', () => {
			expect(TTL.ONE_MINUTE).toBe(60 * 1000);
			expect(TTL.FIVE_MINUTES).toBe(5 * 60 * 1000);
			expect(TTL.FIFTEEN_MINUTES).toBe(15 * 60 * 1000);
			expect(TTL.ONE_HOUR).toBe(60 * 60 * 1000);
			expect(TTL.SIX_HOURS).toBe(6 * 60 * 60 * 1000);
			expect(TTL.ONE_DAY).toBe(24 * 60 * 60 * 1000);
			expect(TTL.ONE_WEEK).toBe(7 * 24 * 60 * 60 * 1000);
		});

		it('should have NEVER as Infinity', () => {
			expect(TTL.NEVER).toBe(Infinity);
		});
	});

	describe('isCacheEnabled', () => {
		it('should return true when enabled', () => {
			expect(isCacheEnabled()).toBe(true);
		});
	});

	describe('getConfiguredTTL', () => {
		it('should return configured TTL values in milliseconds', () => {
			const ttl = getConfiguredTTL();
			expect(ttl.default).toBe(300 * 1000); // 300 seconds to ms
			expect(ttl.schemas).toBe(86400 * 1000); // 86400 seconds to ms
			expect(ttl.index).toBe(300 * 1000);
			expect(ttl.entity).toBe(900 * 1000);
		});
	});

	describe('Cache class (apiCache)', () => {
		describe('get/set', () => {
			it('should store and retrieve cached value', () => {
				const data = { test: 'data' };
				apiCache.set('test-key', data, { ttl: TTL.FIVE_MINUTES });

				const result = apiCache.get('test-key');
				expect(result).toEqual(data);
			});

			it('should return null for non-existent key', () => {
				const result = apiCache.get('non-existent');
				expect(result).toBeNull();
			});

			it('should return null for expired entry', () => {
				vi.useFakeTimers();

				apiCache.set('expire-test', { data: 'test' }, { ttl: 1000 });

				// Fast forward past TTL
				vi.advanceTimersByTime(1500);

				const result = apiCache.get('expire-test');
				expect(result).toBeNull();

				vi.useRealTimers();
			});

			it('should delete expired entry on access', () => {
				vi.useFakeTimers();

				apiCache.set('expire-test', { data: 'test' }, { ttl: 1000 });

				vi.advanceTimersByTime(1500);

				// Access expired entry
				apiCache.get('expire-test');

				// Size should be 0 as expired entry was removed
				expect(apiCache.size).toBe(0);

				vi.useRealTimers();
			});

			it('should not expire entry with Infinity TTL', () => {
				vi.useFakeTimers();

				apiCache.set('never-expire', { data: 'permanent' }, { ttl: Infinity });

				// Fast forward a long time
				vi.advanceTimersByTime(1000 * 60 * 60 * 24 * 365); // 1 year

				const result = apiCache.get('never-expire');
				expect(result).toEqual({ data: 'permanent' });

				vi.useRealTimers();
			});

			it('should update existing entry', () => {
				apiCache.set('update-key', { version: 1 }, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('update-key', { version: 2 }, { ttl: TTL.FIVE_MINUTES });

				const result = apiCache.get<{ version: number }>('update-key');
				expect(result?.version).toBe(2);
			});
		});

		describe('delete', () => {
			it('should remove entry and return true', () => {
				apiCache.set('delete-test', { data: 'test' }, { ttl: TTL.FIVE_MINUTES });

				const result = apiCache.delete('delete-test');
				expect(result).toBe(true);
				expect(apiCache.get('delete-test')).toBeNull();
			});

			it('should return false if entry did not exist', () => {
				const result = apiCache.delete('non-existent');
				expect(result).toBe(false);
			});
		});

		describe('deleteByPrefix', () => {
			it('should delete all matching entries', () => {
				apiCache.set('/api/brands/1', { id: 1 }, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('/api/brands/2', { id: 2 }, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('/api/stores/1', { id: 1 }, { ttl: TTL.FIVE_MINUTES });

				const count = apiCache.deleteByPrefix('/api/brands/');

				expect(count).toBe(2);
				expect(apiCache.get('/api/brands/1')).toBeNull();
				expect(apiCache.get('/api/brands/2')).toBeNull();
				expect(apiCache.get('/api/stores/1')).not.toBeNull();
			});

			it('should return count of deleted entries', () => {
				apiCache.set('prefix-a-1', 1, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('prefix-a-2', 2, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('prefix-b-1', 3, { ttl: TTL.FIVE_MINUTES });

				const count = apiCache.deleteByPrefix('prefix-a-');
				expect(count).toBe(2);
			});
		});

		describe('has', () => {
			it('should return true for valid non-expired entry', () => {
				apiCache.set('has-test', { data: 'test' }, { ttl: TTL.FIVE_MINUTES });
				expect(apiCache.has('has-test')).toBe(true);
			});

			it('should return false for non-existent entry', () => {
				expect(apiCache.has('non-existent')).toBe(false);
			});

			it('should return false for expired entry', () => {
				vi.useFakeTimers();

				apiCache.set('has-expire', { data: 'test' }, { ttl: 1000 });
				vi.advanceTimersByTime(1500);

				expect(apiCache.has('has-expire')).toBe(false);

				vi.useRealTimers();
			});
		});

		describe('clear', () => {
			it('should remove all entries', () => {
				apiCache.set('clear-1', 1, { ttl: TTL.FIVE_MINUTES });
				apiCache.set('clear-2', 2, { ttl: TTL.FIVE_MINUTES });

				apiCache.clear();

				expect(apiCache.size).toBe(0);
				expect(apiCache.get('clear-1')).toBeNull();
				expect(apiCache.get('clear-2')).toBeNull();
			});
		});

		describe('prune', () => {
			it('should remove all expired entries', () => {
				vi.useFakeTimers();

				apiCache.set('prune-expire-1', 1, { ttl: 1000 });
				apiCache.set('prune-expire-2', 2, { ttl: 1000 });
				apiCache.set('prune-keep', 3, { ttl: 10000 });

				vi.advanceTimersByTime(1500);

				const count = apiCache.prune();

				expect(count).toBe(2);
				expect(apiCache.size).toBe(1);
				expect(apiCache.get('prune-keep')).toBe(3);

				vi.useRealTimers();
			});

			it('should not remove non-expired entries', () => {
				apiCache.set('prune-test', { data: 'test' }, { ttl: TTL.FIVE_MINUTES });

				const count = apiCache.prune();

				expect(count).toBe(0);
				expect(apiCache.size).toBe(1);
			});
		});

		describe('getMetadata', () => {
			it('should return entry metadata', () => {
				vi.useFakeTimers();
				const now = Date.now();

				apiCache.set('meta-test', { data: 'test' }, { ttl: TTL.FIVE_MINUTES });

				const metadata = apiCache.getMetadata('meta-test');

				expect(metadata).not.toBeNull();
				expect(metadata?.timestamp).toBe(now);
				expect(metadata?.ttl).toBe(TTL.FIVE_MINUTES);
				expect(metadata?.expiresAt).toBe(now + TTL.FIVE_MINUTES);
				expect(metadata?.remainingMs).toBe(TTL.FIVE_MINUTES);

				vi.useRealTimers();
			});

			it('should return null for non-existent entry', () => {
				const metadata = apiCache.getMetadata('non-existent');
				expect(metadata).toBeNull();
			});

			it('should handle Infinity TTL', () => {
				apiCache.set('infinity-meta', { data: 'test' }, { ttl: Infinity });

				const metadata = apiCache.getMetadata('infinity-meta');

				expect(metadata?.ttl).toBe(Infinity);
				expect(metadata?.expiresAt).toBe(Infinity);
				expect(metadata?.remainingMs).toBe(Infinity);
			});

			it('should calculate remaining time correctly', () => {
				vi.useFakeTimers();

				apiCache.set('remaining-test', { data: 'test' }, { ttl: 10000 });

				vi.advanceTimersByTime(3000);

				const metadata = apiCache.getMetadata('remaining-test');
				expect(metadata?.remainingMs).toBe(7000);

				vi.useRealTimers();
			});
		});

		describe('size', () => {
			it('should return number of cached entries', () => {
				expect(apiCache.size).toBe(0);

				apiCache.set('size-1', 1, { ttl: TTL.FIVE_MINUTES });
				expect(apiCache.size).toBe(1);

				apiCache.set('size-2', 2, { ttl: TTL.FIVE_MINUTES });
				expect(apiCache.size).toBe(2);
			});
		});
	});

	describe('getTTLForPath', () => {
		it('should return schema TTL for /api/schemas/', () => {
			const ttl = getTTLForPath('/api/schemas/brand');
			expect(ttl).toBe(86400 * 1000); // 1 day in ms
		});

		it('should return index TTL for /api/stores', () => {
			const ttl = getTTLForPath('/api/stores');
			expect(ttl).toBe(300 * 1000);
		});

		it('should return index TTL for /api/brands', () => {
			const ttl = getTTLForPath('/api/brands');
			expect(ttl).toBe(300 * 1000);
		});

		it('should return entity TTL for individual resources', () => {
			const storeTtl = getTTLForPath('/api/stores/test-store');
			expect(storeTtl).toBe(900 * 1000);

			const brandTtl = getTTLForPath('/api/brands/test-brand');
			expect(brandTtl).toBe(900 * 1000);
		});

		it('should return entity TTL for nested materials', () => {
			const ttl = getTTLForPath('/api/brands/test-brand/materials');
			expect(ttl).toBe(900 * 1000);
		});

		it('should return default TTL for unknown paths', () => {
			const ttl = getTTLForPath('/api/unknown/path');
			expect(ttl).toBe(300 * 1000);
		});
	});
});
