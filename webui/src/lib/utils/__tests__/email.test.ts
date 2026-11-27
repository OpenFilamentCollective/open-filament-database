import { describe, it, expect } from 'vitest';
import { sameEmail } from '$lib/utils/email';

describe('sameEmail', () => {
	it('ignores case and surrounding spaces, never matches a missing address', () => {
		expect(sameEmail('Jane@Example.com', ' jane@example.com ')).toBe(true);
		expect(sameEmail('jane@example.com', 'john@example.com')).toBe(false);
		expect(sameEmail(undefined, undefined)).toBe(false);
		expect(sameEmail('', '')).toBe(false);
	});
});
