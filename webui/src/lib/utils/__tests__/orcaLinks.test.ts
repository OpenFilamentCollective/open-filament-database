import { describe, it, expect, vi, beforeEach } from 'vitest';

// The helpers read PUBLIC_API_BASE_URL at call time, so the mock is a mutable
// object the tests reassign between cases.
const mockEnv: Record<string, string> = { PUBLIC_API_BASE_URL: '' };
vi.mock('$env/dynamic/public', () => ({ env: mockEnv }));

const {
	orcaBaseUrl,
	orcaProfileUrl,
	orcaBundleUrl,
	orcaProfileFilename,
	orcaCanExport,
	orcaBrandCanExport
} = await import('../orcaLinks');

describe('with PUBLIC_API_BASE_URL unset', () => {
	beforeEach(() => {
		mockEnv.PUBLIC_API_BASE_URL = '';
	});

	it('returns null so the download buttons stay hidden in local mode', () => {
		expect(orcaBaseUrl()).toBeNull();
		expect(orcaProfileUrl('acme', 'pla', 'basic_pla')).toBeNull();
		expect(orcaBundleUrl('acme', ['PLA'])).toBeNull();
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
		expect(orcaBundleUrl('bambu_lab', ['PLA', 'PEEK'])).toBe(
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
		expect(orcaBundleUrl('', ['PLA'])).toBeNull();
	});

	// The exporter writes nothing for these, so a link would be a link to a 404.
	it('offers no link for a material the exporter skips', () => {
		expect(orcaProfileUrl('acme', 'peek', 'super_peek')).toBeNull();
		expect(orcaProfileUrl('acme', 'pvdf', 'x')).toBeNull();
	});

	it('offers no bundle for a brand with nothing exportable', () => {
		expect(orcaBundleUrl('acme', ['PEEK', 'PEI'])).toBeNull();
		expect(orcaBundleUrl('acme')).toBeNull();
	});

	// PPA has no default base; only the filled variants inherit one.
	it('links a name-only material only when the name earns it', () => {
		expect(orcaProfileUrl('acme', 'ppa', 'ppa_cf', 'PPA CF')).toContain('/materials/PPA/');
		expect(orcaProfileUrl('acme', 'ppa', 'plain_ppa', 'Plain PPA')).toBeNull();
	});
});

describe('orcaCanExport', () => {
	// Mirrors ofd.builder.orca_mapping.resolve_base_profile; the generated
	// material list is kept in step by tests/test_orca_exporter.py.
	it('accepts a mapped material regardless of name', () => {
		expect(orcaCanExport('PLA')).toBe(true);
		expect(orcaCanExport('pla', 'Anything At All')).toBe(true);
	});

	it('rejects an unmapped material', () => {
		expect(orcaCanExport('PEEK', 'PEEK CF')).toBe(false);
		expect(orcaCanExport('')).toBe(false);
	});

	it('resolves a name-only material through its fill refinement', () => {
		expect(orcaCanExport('PPA', 'Acme PPA-CF')).toBe(true);
		expect(orcaCanExport('PPA', 'Acme PPA GF')).toBe(true);
		expect(orcaCanExport('PPA', 'Acme PPA')).toBe(false);
	});

	it('does not fire a refinement on a substring', () => {
		expect(orcaCanExport('PPA', 'Acme PPA Crafty')).toBe(false);
	});

	it('hides a name-only material when the name is unknown', () => {
		expect(orcaCanExport('PPA')).toBe(false);
	});
});

describe('orcaBrandCanExport', () => {
	it('needs only one exportable material', () => {
		expect(orcaBrandCanExport(['PEEK', 'PPS', 'PLA'])).toBe(true);
	});

	it('rejects a brand of nothing but unmapped materials', () => {
		expect(orcaBrandCanExport(['PEEK', 'PPS'])).toBe(false);
		expect(orcaBrandCanExport([])).toBe(false);
	});

	// Filament names are not loaded on the brand page, so a name-only material
	// counts as a maybe rather than hiding a bundle that probably exists.
	it('treats a name-only material as a maybe', () => {
		expect(orcaBrandCanExport(['PPA'])).toBe(true);
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
