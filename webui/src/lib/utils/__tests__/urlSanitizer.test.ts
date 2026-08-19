import { describe, it, expect } from 'vitest';
import {
	stripTrackingParams,
	hasTrackingParams,
	getHost,
	rewriteHost,
	stripTrackersDeep,
	isStorefrontRoot,
	looksLikeProductPage
} from '../urlSanitizer';

describe('stripTrackingParams', () => {
	it('strips an Amazon affiliate link', () => {
		expect(
			stripTrackingParams(
				'https://www.amazon.eg/dp/B0GVSM88NP/?tag=3dfil-20&linkCode=ogi&psc=1&th=1'
			)
		).toBe('https://www.amazon.eg/dp/B0GVSM88NP/');
	});

	it('keeps a Shopify variant selector', () => {
		const u = 'https://shop.polymaker.com/products/panchroma-galaxy?variant=44933539987513';
		expect(stripTrackingParams(u)).toBe(u);
	});

	it('keeps a meaningful selector and a content fragment', () => {
		const u =
			'https://shop.polymaker.com/products/panchroma-pla?variant=45411122413625#productinfo';
		expect(stripTrackingParams(u)).toBe(u);
	});

	it('removes a trailing empty query', () => {
		expect(stripTrackingParams('https://us.polymaker.com/products/panchroma-glow?')).toBe(
			'https://us.polymaker.com/products/panchroma-glow'
		);
	});

	it('removes trackers but keeps meaningful params (order preserved)', () => {
		expect(stripTrackingParams('https://x.com/p?utm_source=a&variant=5&gclid=z')).toBe(
			'https://x.com/p?variant=5'
		);
	});

	it('strips a tracking fragment but keeps a content anchor', () => {
		expect(stripTrackingParams('https://x.com/p#utm_source=a')).toBe('https://x.com/p');
		expect(stripTrackingParams('https://x.com/p#section-2')).toBe('https://x.com/p#section-2');
	});

	it('strips the real Shopify search params seen in the data', () => {
		expect(
			stripTrackingParams(
				'https://www.printedsolid.com/products/jessie-pla?_pos=8&_psq=jessie&_ss=e&_v=1.0'
			)
		).toBe('https://www.printedsolid.com/products/jessie-pla');
	});

	it('is idempotent', () => {
		const dirty = 'https://www.amazon.eg/dp/B0GVSM88NP/?tag=3dfil-20&th=1';
		const once = stripTrackingParams(dirty);
		expect(stripTrackingParams(once)).toBe(once);
	});

	it('leaves a clean URL untouched and returns empty input as-is', () => {
		expect(stripTrackingParams('https://x.com/p?variant=5')).toBe('https://x.com/p?variant=5');
		expect(stripTrackingParams('')).toBe('');
	});

	it('drops the entire query on Amazon (identity is the /dp/<ASIN> path)', () => {
		const dirty =
			'https://www.amazon.com/AmeLeis-Printer-Filament-Bundle-1-75mm/dp/B0GYNWLN2F?dib=eyJ2IjoiMSJ9.abc&dib_tag=se&keywords=AmeLeis&qid=1784042998&sr=8-1';
		expect(stripTrackingParams(dirty)).toBe(
			'https://www.amazon.com/AmeLeis-Printer-Filament-Bundle-1-75mm/dp/B0GYNWLN2F'
		);
		expect(hasTrackingParams(dirty)).toBe(true);
	});

	it('drops the query on amazon regional + eBay hosts too', () => {
		expect(stripTrackingParams('https://www.amazon.co.uk/dp/B01?ref=sr_1&pd_rd_w=abc')).toBe(
			'https://www.amazon.co.uk/dp/B01'
		);
		expect(stripTrackingParams('https://www.ebay.com/itm/12345?_trkparms=x&hash=y')).toBe(
			'https://www.ebay.com/itm/12345'
		);
	});

	it('still keeps meaningful params on non-marketplace hosts', () => {
		// A tracker is removed but the Shopify selector survives.
		expect(stripTrackingParams('https://shop.x.com/products/y?variant=5&utm_source=z')).toBe(
			'https://shop.x.com/products/y?variant=5'
		);
	});

	it('strips pd_rd_/pf_rd_ prefix families anywhere', () => {
		expect(stripTrackingParams('https://x.com/p?pd_rd_w=1&pf_rd_r=2&color=red')).toBe(
			'https://x.com/p?color=red'
		);
	});
});

describe('hasTrackingParams', () => {
	it('detects trackers', () => {
		expect(hasTrackingParams('https://a.com/x?tag=aff-20')).toBe(true);
		expect(hasTrackingParams('https://a.com/x?variant=5')).toBe(false);
	});
});

describe('getHost', () => {
	it('extracts the hostname without port', () => {
		expect(getHost('https://shop.polymaker.com/products/x')).toBe('shop.polymaker.com');
	});
	it('handles protocol-less input', () => {
		expect(getHost('shop.polymaker.com/products/x')).toBe('shop.polymaker.com');
	});
	it('returns null for junk', () => {
		expect(getHost('not a url')).toBe(null);
		expect(getHost('')).toBe(null);
	});
});

describe('rewriteHost', () => {
	it('rewrites the host and preserves the path', () => {
		expect(
			rewriteHost('https://shop.polymaker.com/products/panchroma-glow', 'us.polymaker.com')
		).toBe('https://us.polymaker.com/products/panchroma-glow');
	});
	it('preserves query and fragment', () => {
		expect(rewriteHost('https://shop.polymaker.com/p?variant=5#info', 'us.polymaker.com')).toBe(
			'https://us.polymaker.com/p?variant=5#info'
		);
	});
	it('returns input unchanged when unparseable', () => {
		expect(rewriteHost('not a url', 'x.com')).toBe('not a url');
	});
});

describe('stripTrackersDeep', () => {
	it('strips URL fields nested in sizes[].purchase_links[]', () => {
		const entity = {
			name: 'Red',
			sizes: [
				{
					filament_weight: 1000,
					purchase_links: [
						{ store_id: 'amazon', url: 'https://www.amazon.com/dp/B0X?tag=aff&keywords=pla' },
						{ store_id: 'poly', url: 'https://shop.polymaker.com/p?variant=5&utm_source=x' }
					]
				}
			]
		};
		const out = stripTrackersDeep(entity);
		expect(out.sizes[0].purchase_links[0].url).toBe('https://www.amazon.com/dp/B0X');
		expect(out.sizes[0].purchase_links[1].url).toBe('https://shop.polymaker.com/p?variant=5');
		// non-URL fields untouched, original not mutated
		expect(out.sizes[0].purchase_links[0].store_id).toBe('amazon');
		expect(entity.sizes[0].purchase_links[0].url).toContain('tag=aff');
	});

	it('strips top-level url fields (storefront_url, website, data_sheet_url)', () => {
		const out = stripTrackersDeep({
			storefront_url: 'https://shop.x.com/?ref=nav',
			website: 'https://brand.com/?utm_campaign=y',
			data_sheet_url: 'https://x.com/ds.pdf?gclid=z',
			name: 'Brand'
		});
		expect(out.storefront_url).toBe('https://shop.x.com/');
		expect(out.website).toBe('https://brand.com/');
		expect(out.data_sheet_url).toBe('https://x.com/ds.pdf');
		expect(out.name).toBe('Brand');
	});
});

describe('SimplyPrint recommender params', () => {
	// These reached `main` on 3dhojor's datasheet URLs (#461) because nothing matched them.
	const suRec =
		'https://3dhojor.com/products/3dprinting-silk-pla-dual-tri-color-filament' +
		'?_su_rec=tHGijyqxpJgrAXISK1V6KIs&_su_rec_id=76ac0788-67aa-4a2e-bed7&variant=44298583081060';

	it('strips _su_rec and _su_rec_id but keeps the product variant selector', () => {
		expect(stripTrackingParams(suRec)).toBe(
			'https://3dhojor.com/products/3dprinting-silk-pla-dual-tri-color-filament?variant=44298583081060'
		);
	});

	it('matches any _su_ prefixed key', () => {
		expect(hasTrackingParams('https://shop.com/p?_su_anything=1')).toBe(true);
	});
});

describe('isStorefrontRoot', () => {
	it('rejects a bare origin — the #454 case', () => {
		expect(isStorefrontRoot('https://store.bambulab.com/')).toBe(true);
		expect(isStorefrontRoot('https://store.bambulab.com')).toBe(true);
	});

	it('rejects a lone landing segment', () => {
		expect(isStorefrontRoot('https://example.com/shop')).toBe(true);
		expect(isStorefrontRoot('https://example.com/store/')).toBe(true);
	});

	it('accepts a real product URL', () => {
		expect(isStorefrontRoot('https://eu.store.bambulab.com/products/pla-cmyk-lithophane')).toBe(
			false
		);
		// Single-segment product paths are legitimate on some shops (e.g. alza.cz).
		expect(isStorefrontRoot('https://www.alza.cz/alzament-abs-1-kg-black-d13015343.htm')).toBe(
			false
		);
	});

	it('rejects a URL equal to the selected store’s storefront, however deep', () => {
		expect(isStorefrontRoot('https://example.com/eu/shop', 'https://example.com/eu/shop')).toBe(
			true
		);
		expect(
			isStorefrontRoot('https://example.com/eu/shop/products/x', 'https://example.com/eu/shop')
		).toBe(false);
	});

	it('rejects a URL equal to the brand website', () => {
		expect(isStorefrontRoot('https://brand.com/en/', null, 'https://brand.com/en')).toBe(true);
	});

	it('ignores tracking query params and fragments when comparing', () => {
		expect(isStorefrontRoot('https://store.bambulab.com/?utm_source=x#top')).toBe(true);
	});

	it('accepts a product identified by the query string rather than the path', () => {
		// Older shop software (OpenCart, PrestaShop) routes products through `index.php`.
		expect(
			isStorefrontRoot('https://shop.example.com/index.php?route=product/product&product_id=123')
		).toBe(false);
		expect(isStorefrontRoot('https://example.com/shop?p=4711')).toBe(false);
		// Including when the path is exactly the store's own front page.
		expect(
			isStorefrontRoot('https://example.com/eu/shop?product_id=9', 'https://example.com/eu/shop')
		).toBe(false);
	});

	it('is false for an unparseable value', () => {
		expect(isStorefrontRoot('')).toBe(false);
		expect(isStorefrontRoot('not a url at all')).toBe(false);
	});
});

describe('looksLikeProductPage', () => {
	it('flags a shop product path', () => {
		expect(looksLikeProductPage('https://3dhojor.com/products/silk-pla')).toBe(true);
		expect(looksLikeProductPage('https://www.amazon.de/-/da/dp/B0FB93XQLM')).toBe(true);
	});

	it('flags any URL carrying a variant selector', () => {
		expect(looksLikeProductPage('https://primacreator.com/x?variant=48794154')).toBe(true);
	});

	it('accepts a document URL', () => {
		expect(looksLikeProductPage('https://brand.com/docs/pla-tds.pdf')).toBe(false);
		expect(looksLikeProductPage('https://brand.com/support/technical-data-sheets')).toBe(false);
	});

	it('does not flag a PDF that happens to sit under /products/', () => {
		expect(looksLikeProductPage('https://brand.com/products/pla/tds.pdf')).toBe(false);
	});

	it('is false for empty input', () => {
		expect(looksLikeProductPage('')).toBe(false);
	});
});

describe('Amazon /ref= path breadcrumb', () => {
	// #408 shipped this and a maintainer shortened it by hand in review.
	const dirty =
		'https://www.amazon.de/-/da/AzureFilm-PLA-filament-3D-printer-praecision-prototyper/dp/B0FB93XQLM/ref=sr_1_6';

	it('truncates the path at the /ref= segment', () => {
		expect(stripTrackingParams(dirty)).toBe(
			'https://www.amazon.de/-/da/AzureFilm-PLA-filament-3D-printer-praecision-prototyper/dp/B0FB93XQLM'
		);
		expect(hasTrackingParams(dirty)).toBe(true);
	});

	it('is idempotent', () => {
		const once = stripTrackingParams(dirty);
		expect(stripTrackingParams(once)).toBe(once);
	});

	it('strips the breadcrumb and the query together', () => {
		expect(
			stripTrackingParams('https://www.amazon.com/x/dp/B01/ref=sr_1_1?qid=1&sr=8-1')
		).toBe('https://www.amazon.com/x/dp/B01');
	});

	it('leaves non-Amazon hosts alone', () => {
		// Only Amazon uses `/ref=` this way; elsewhere it could be a real path.
		expect(stripTrackingParams('https://shop.x.com/ref=partner')).toBe(
			'https://shop.x.com/ref=partner'
		);
	});

	it('leaves an Amazon URL with no breadcrumb untouched', () => {
		expect(stripTrackingParams('https://www.amazon.de/-/da/dp/B0FB93XQLM')).toBe(
			'https://www.amazon.de/-/da/dp/B0FB93XQLM'
		);
	});
});
