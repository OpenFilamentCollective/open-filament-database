<script lang="ts">
	import { untrack } from 'svelte';
	import type { Store } from '$lib/types/database';
	import { Button } from '$lib/components/ui';
	import UrlField from './UrlField.svelte';
	import { INPUT_XS_CLASSES, LABEL_COMPACT_CLASSES } from '$lib/styles/formStyles';
	import { getHost, rewriteHost } from '$lib/utils/urlSanitizer';

	interface Props {
		storeId: string;
		url: string;
		stores: Store[];
		index: number;
		sizeId: number;
		linkId: number;
		onRemove: () => void;
	}

	let {
		storeId = $bindable(''),
		url = $bindable(''),
		stores,
		index,
		sizeId,
		linkId,
		onRemove
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

	// Canonical host from the selected store's storefront URL.
	let canonicalHost = $derived.by(() => {
		const store = stores.find((s) => (s.slug ?? s.id) === storeId);
		return store?.storefront_url ? getHost(store.storefront_url) : null;
	});
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
			{#if hostMismatch}
				<div class="mt-1.5 flex items-center justify-between gap-2 rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1.5 text-xs">
					<span class="text-amber-700 dark:text-amber-400">
						Link uses <strong>{linkHost}</strong> but this store is <strong>{canonicalHost}</strong>.
					</span>
					<div class="flex shrink-0 items-center gap-1">
						<a
							href={url}
							target="_blank"
							rel="noopener noreferrer"
							class="rounded px-1.5 py-0.5 text-primary hover:underline"
							title="Open the current link in a new tab to verify"
						>
							Open ↗
						</a>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onclick={fixHost}
							class="h-6 border-amber-500/40 px-2 text-xs"
							title="Rewrite the link host to {canonicalHost}"
						>
							Fix → {canonicalHost}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>
