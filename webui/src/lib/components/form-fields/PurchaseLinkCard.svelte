<script lang="ts">
	import { untrack } from 'svelte';
	import type { Store } from '$lib/types/database';
	import { Button, FixHint } from '$lib/components/ui';
	import UrlField from './UrlField.svelte';
	import { INPUT_XS_CLASSES, LABEL_COMPACT_CLASSES } from '$lib/styles/formStyles';
	import { getHost, rewriteHost, isStorefrontRoot } from '$lib/utils/urlSanitizer';

	interface Props {
		storeId: string;
		url: string;
		stores: Store[];
		index: number;
		sizeId: number;
		linkId: number;
		onRemove: () => void;
		/**
		 * Names of the OTHER colours of this filament that already use this exact URL.
		 * Shown last of the link hints: it is advice only a human can act on, so it
		 * must not displace the storefront-root error or the one-click host fix.
		 * Passed down from the filament's variant list; empty when the siblings aren't
		 * loaded or the link is colour-specific.
		 */
		sharedWithVariants?: string[];
	}

	let {
		storeId = $bindable(''),
		url = $bindable(''),
		stores,
		index,
		sizeId,
		linkId,
		onRemove,
		sharedWithVariants = []
	}: Props = $props();

	/** Registrable-ish base domain: the last two labels (shop.x.com & us.x.com → x.com). */
	function baseDomain(host: string): string {
		const labels = host.split('.');
		return labels.length >= 2 ? labels.slice(-2).join('.') : host;
	}

	/** Best-effort brand key from a host: drop generic subdomains + the TLD so different
	 *  storefront hosts of the same brand collapse together (www.amazon.co.uk & amazon.eg →
	 *  amazon; shop.polymaker.com & us.polymaker.com → polymaker). No public-suffix list. */
	function siteKey(host: string): string {
		const labels = host.toLowerCase().split('.').filter(Boolean);
		const generic = new Set(['www', 'www2', 'm', 'shop', 'store', 'us', 'eu', 'uk', 'de', 'en']);
		while (labels.length > 2 && generic.has(labels[0])) labels.shift();
		const twoPart = new Set(['co.uk', 'com.au', 'co.jp', 'com.br', 'co.nz', 'com.mx', 'co.za', 'co.in']);
		if (labels.length >= 3 && twoPart.has(labels.slice(-2).join('.'))) labels.splice(-2, 2);
		else if (labels.length >= 2) labels.pop();
		return labels.join('.');
	}

	// Auto-detect the store from the URL's host when none is picked yet — matches the URL host
	// against each store's storefront host by brand key. Respects an existing selection.
	$effect(() => {
		const host = getHost(url); // re-run when the URL changes
		if (!host || untrack(() => storeId)) return;
		const key = siteKey(host);
		if (!key) return;
		const match = stores.find((s) => {
			const sh = s.storefront_url ? getHost(s.storefront_url) : null;
			return sh ? siteKey(sh) === key : false;
		});
		if (match) storeId = match.slug ?? match.id;
	});

	let selectedStore = $derived(stores.find((s) => (s.slug ?? s.id) === storeId));

	// Canonical host from the selected store's storefront URL.
	let canonicalHost = $derived(
		selectedStore?.storefront_url ? getHost(selectedStore.storefront_url) : null
	);

	// A homepage identifies neither the filament nor the colour. #454 was submitted as
	// `https://store.bambulab.com/` and a maintainer had to find the product page by hand.
	let storefrontRoot = $derived(
		!!url && isStorefrontRoot(url, selectedStore?.storefront_url ?? null)
	);
	let linkHost = $derived(getHost(url));

	// Warn only on subdomain drift (same base domain, different host) — the case the Fix can
	// safely rewrite. Cross-domain links (e.g. an Amazon link under a brand store) are left alone.
	let hostMismatch = $derived(
		!!canonicalHost &&
			!!linkHost &&
			linkHost !== canonicalHost &&
			baseDomain(linkHost) === baseDomain(canonicalHost)
	);

	function fixHost() {
		if (canonicalHost) url = rewriteHost(url, canonicalHost);
	}
</script>

<div class="border border-border/50 rounded p-2 mb-2 bg-muted/30">
	<div class="flex justify-between items-center mb-2">
		<span class="text-xs font-medium">Link {index + 1}</span>
		<Button
			type="button"
			onclick={onRemove}
			title="Remove purchase link {index + 1}"
			variant="ghost"
			size="sm"
			class="text-destructive hover:text-destructive/80 h-6 px-2 text-xs"
		>
			Remove
		</Button>
	</div>

	<div class="space-y-2">
		<!-- Store dropdown -->
		<div>
			<label for="size-{sizeId}-link-{linkId}-store" class={LABEL_COMPACT_CLASSES}>
				Store <span class="text-destructive">*</span>
			</label>
			<select id="size-{sizeId}-link-{linkId}-store" bind:value={storeId} class={INPUT_XS_CLASSES}>
				<option value="">Select store...</option>
				{#each stores as store}
					<option value={store.slug ?? store.id}>{store.name}</option>
				{/each}
			</select>
		</div>

		<!-- URL -->
		<div>
			<label for="size-{sizeId}-link-{linkId}-url" class={LABEL_COMPACT_CLASSES}>
				URL <span class="text-destructive">*</span>
			</label>
			<UrlField
				bind:value={url}
				id="size-{sizeId}-link-{linkId}-url"
				required
				placeholder="store.com/product/..."
				compact
			/>
			{#if storefrontRoot}
				<FixHint level="error" compact href={url} class="mt-1.5">
					That's the shop homepage, not a product page. Link the page for this specific
					product — or leave this blank until you have one.
				</FixHint>
			{:else if hostMismatch}
				<FixHint
					compact
					href={url}
					fixLabel="Fix → {canonicalHost}"
					onFix={fixHost}
					fixTitle="Rewrite the link host to {canonicalHost}"
					class="mt-1.5"
				>
					Link uses <strong>{linkHost}</strong> but this store is <strong>{canonicalHost}</strong>.
				</FixHint>
			{:else if sharedWithVariants.length > 0}
				{@const shown = sharedWithVariants.slice(0, 3)}
				{@const extra = sharedWithVariants.length - shown.length}
				<FixHint compact href={url} class="mt-1.5">
					This link is also used by <strong>{shown.join(', ')}</strong>{extra > 0
						? ` and ${extra} other colour${extra === 1 ? '' : 's'}`
						: ''}. Prefer this colour's own product page if the shop has one.
				</FixHint>
			{/if}
		</div>
	</div>
</div>
