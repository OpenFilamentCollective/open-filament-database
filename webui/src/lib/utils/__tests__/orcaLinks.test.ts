import { describe, it, expect, vi, beforeEach } from 'vitest';

// The helpers read PUBLIC_API_BASE_URL at call time, so the mock is a mutable
// object the tests reassign between cases.
const mockEnv: Record<string, string> = { PUBLIC_API_BASE_URL: '' };
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));

const { orcaBaseUrl, orcaProfileUrl, orcaBundleUrl, orcaProfileFilename } =
	await import('../orcaLinks');

describe('with PUBLIC_API_BASE_URL unset', () => {
	beforeEach(() => {
		mockEnv.PUBLIC_API_BASE_URL = '';
	});

	it('returns null so the download buttons stay hidden in local mode', () => {
		expect(orcaBaseUrl()).toBeNull();
		expect(orcaProfileUrl('acme', 'pla', 'basic_pla')).toBeNull();
		expect(orcaBundleUrl('acme')).toBeNull();
	});
});

describe('with PUBLIC_API_BASE_URL set', () => {
	beforeEach(() => {
		mockEnv.PUBLIC_API_BASE_URL = 'https://api.openfilamentdatabase.org';
	});

	it('mirrors the static API path shape', () => {
		expect(orcaProfileUrl('acme', 'pla', 'basic_pla')).toBe(
			'https://api.openfilamentdatabase.org/orcaslicer/brands/acme/materials/PLA/filaments/basic_pla.json'
		);
	});

	it('upper-cases the material segment, as the API path does', () => {
		expect(orcaProfileUrl('acme', 'petg', 'x')).toContain('/materials/PETG/');
		expect(orcaProfileUrl('acme', 'PETG', 'x')).toContain('/materials/PETG/');
	});

	it('builds a brand bundle link', () => {
		expect(orcaBundleUrl('bambu_lab')).toBe(
			'https://api.openfilamentdatabase.org/orcaslicer/bundles/bambu_lab.zip'
		);
	});

	it('tolerates a trailing slash on the base URL', () => {
		mockEnv.PUBLIC_API_BASE_URL = 'https://api.openfilamentdatabase.org/';
		expect(orcaBaseUrl()).toBe('https://api.openfilamentdatabase.org/orcaslicer');
	});

	it('returns null when a path segment is missing', () => {
		expect(orcaProfileUrl('', 'pla', 'basic')).toBeNull();
		expect(orcaProfileUrl('acme', 'pla', '')).toBeNull();
		expect(orcaBundleUrl('')).toBeNull();
	});
});

describe('orcaProfileFilename', () => {
	it('matches the preset name written inside the file', () => {
		expect(orcaProfileFilename('Add-North', 'PLA Economy')).toBe(
			'Add-North PLA Economy (OFD).json'
		);
	});

	it('strips characters that are illegal in filenames', () => {
		expect(orcaProfileFilename('Acme', 'PLA/PHA Blend')).toBe('Acme PLA_PHA Blend (OFD).json');
	});
});
