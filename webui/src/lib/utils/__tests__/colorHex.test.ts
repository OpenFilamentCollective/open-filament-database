import { describe, it, expect } from 'vitest';
import {
	colorHexList,
	primaryColorHex,
	isValidColorHex,
	packColorHex,
	colorSwatchStyle,
	formatColorHex
} from '../colorHex';

describe('colorHexList', () => {
	it('wraps a single hex string in a list', () => {
		expect(colorHexList('#FF5733')).toEqual(['#FF5733']);
	});

	it('passes an array through', () => {
		expect(colorHexList(['#F6C500', '#4D6383'])).toEqual(['#F6C500', '#4D6383']);
	});

	it('drops empty entries and missing values', () => {
		expect(colorHexList(['#F6C500', ''])).toEqual(['#F6C500']);
		expect(colorHexList('')).toEqual([]);
		expect(colorHexList(undefined)).toEqual([]);
		expect(colorHexList(null)).toEqual([]);
	});
});

describe('primaryColorHex', () => {
	it('returns the first colour of a multi-colour variant', () => {
		expect(primaryColorHex(['#F6C500', '#4D6383'])).toBe('#F6C500');
	});

	it('returns an empty string when there is no colour', () => {
		expect(primaryColorHex([])).toBe('');
		expect(primaryColorHex(undefined)).toBe('');
	});
});

describe('isValidColorHex', () => {
	it('accepts a complete single hex in either case', () => {
		expect(isValidColorHex('#FF5733')).toBe(true);
		expect(isValidColorHex('#ff5733')).toBe(true);
	});

	it('accepts an array where every entry is complete', () => {
		expect(isValidColorHex(['#F6C500', '#4D6383'])).toBe(true);
	});

	// A half-typed row in the form must block submit rather than be silently dropped.
	it('rejects an array containing an empty or partial entry', () => {
		expect(isValidColorHex(['#F6C500', ''])).toBe(false);
		expect(isValidColorHex(['#F6C500', '#4D6'])).toBe(false);
	});

	it('rejects missing, empty and malformed values', () => {
		expect(isValidColorHex(undefined)).toBe(false);
		expect(isValidColorHex(null)).toBe(false);
		expect(isValidColorHex('')).toBe(false);
		expect(isValidColorHex([])).toBe(false);
		expect(isValidColorHex('FF5733')).toBe(false);
		expect(isValidColorHex('#FF57')).toBe(false);
		expect(isValidColorHex('#GGGGGG')).toBe(false);
	});
});

describe('packColorHex', () => {
	it('stores one colour as a plain string', () => {
		expect(packColorHex(['#FF5733'])).toBe('#FF5733');
	});

	it('stores several colours as an array', () => {
		expect(packColorHex(['#F6C500', '#4D6383'])).toEqual(['#F6C500', '#4D6383']);
	});

	it('collapses an empty list to an empty string', () => {
		expect(packColorHex([])).toBe('');
	});

	// Empty rows are preserved so validation can reject them before submit.
	it('keeps a blank entry when there is more than one row', () => {
		expect(packColorHex(['#F6C500', ''])).toEqual(['#F6C500', '']);
	});
});

describe('colorSwatchStyle', () => {
	it('uses a flat background for a single colour', () => {
		expect(colorSwatchStyle('#FF5733')).toBe('background-color: #FF5733');
	});

	it('bands multiple colours into a gradient', () => {
		expect(colorSwatchStyle(['#F6C500', '#4D6383'])).toBe(
			'background: linear-gradient(135deg, #F6C500 0%, #F6C500 50%, #4D6383 50%, #4D6383 100%)'
		);
	});

	it('returns nothing when there is no colour', () => {
		expect(colorSwatchStyle(undefined)).toBe('');
	});
});

describe('formatColorHex', () => {
	it('joins multiple colours for display', () => {
		expect(formatColorHex(['#F6C500', '#4D6383'])).toBe('#F6C500 / #4D6383');
	});

	it('leaves a single colour untouched', () => {
		expect(formatColorHex('#FF5733')).toBe('#FF5733');
	});
});
