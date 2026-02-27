import path from 'path';

/**
 * Validates that a path segment is safe to use in path.join().
 * Rejects values containing '..', path separators, or null bytes.
 * Throws an error on invalid input.
 */
export function validatePathSegment(segment: string, paramName: string): string {
	if (
		!segment ||
		segment.includes('..') ||
		segment.includes('/') ||
		segment.includes('\\') ||
		segment.includes('\0') ||
		path.basename(segment) !== segment
	) {
		throw new Error(`Invalid ${paramName}: contains unsafe path characters`);
	}
	return segment;
}
