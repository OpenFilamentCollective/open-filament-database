<script lang="ts">
	import { browser } from '$app/environment';
	import { useChangeTracking, isCloudMode, apiBaseUrl } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';
	import * as imageDb from '$lib/services/imageDb';

	interface Props {
		src: string;
		alt?: string;
		type: 'store' | 'brand';
		id: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { src, alt = '', type, id, size = 'md' }: Props = $props();

	const sizeClasses = {
		sm: 'h-8 w-8',
		md: 'h-16 w-16',
		lg: 'h-24 w-24'
	};

	// Async-loaded data URL from IndexedDB for change-tracked images
	let indexedDbUrl = $state<string>('');

	// Build logo URL based on environment mode, supporting base64 data URLs
	const logoUrl = $derived.by(() => {
		if (!src || !browser) return ''; // Don't generate URL during SSR

		// Support data URLs directly (base64 encoded images)
		if (src.startsWith('data:')) {
			return src;
		}

		// Use the async-loaded IndexedDB URL if available
		if (indexedDbUrl) {
			return indexedDbUrl;
		}

		// In cloud mode, load straight from the CDN. It serves logos over HTTP/2,
		// so dozens load in parallel instead of queueing behind the browser's
		// ~6-connection-per-origin HTTP/1.1 limit on the local proxy — and with
		// `access-control-allow-origin: *`, a long max-age, and Cloudflare edge
		// caching. Routing every icon through the same-origin /api proxy serialized
		// them and added a server→cloud round-trip each, which is what made all
		// icons take a few seconds to appear. (Cross-origin <img> is unaffected by
		// OpaqueResponseBlocking: the response is a real image/* with CORS `*`.)
		// encodeURIComponent: logo filenames contain spaces and other unsafe chars.
		if ($isCloudMode) {
			return `${$apiBaseUrl}/api/v1/${type}s/logo/${encodeURIComponent(src)}`;
		}

		// Local mode: same-origin endpoint backed by the filesystem.
		return `/api/${type}s/${id}/logo/${src}`;
	});

	// Asynchronously load image data from IndexedDB when change tracking has a matching image
	$effect(() => {
		if (!browser || !src || !$useChangeTracking || src.startsWith('data:')) {
			indexedDbUrl = '';
			return;
		}

		// Check if src is an image ID in the change store
		const imageRef = $changeStore.images[src];
		if (imageRef) {
			imageDb.getImage(imageRef.storageKey).then((data) => {
				if (data) {
					indexedDbUrl = `data:${imageRef.mimeType};base64,${data}`;
				}
			}).catch((e) => {
				console.error('Failed to retrieve image from IndexedDB:', e);
			});
			return;
		}

		// Also check by entity path for this entity's logo property
		const entityPath = `${type}s/${id}`;
		for (const [, imgRef] of Object.entries($changeStore.images)) {
			if (imgRef.entityPath === entityPath && imgRef.property === 'logo') {
				imageDb.getImage(imgRef.storageKey).then((data) => {
					if (data) {
						indexedDbUrl = `data:${imgRef.mimeType};base64,${data}`;
					}
				}).catch((e) => {
					console.error('Failed to retrieve image from IndexedDB:', e);
				});
				return;
			}
		}

		// No matching image in change store
		indexedDbUrl = '';
	});

	// Handle image load errors (logo not available in cloud mode)
	let imageError = $state(false);

	// Reset error state when logoUrl changes (e.g., change store hydrates with correct data URL)
	$effect(() => {
		logoUrl; // track
		imageError = false;
	});

	function handleError() {
		imageError = true;
	}
</script>

{#if !browser}
	<!-- Show placeholder during SSR -->
	<div class="flex items-center justify-center bg-muted rounded {sizeClasses[size]}">
		<span class="text-muted-foreground text-xs font-medium">{alt.charAt(0).toUpperCase()}</span>
	</div>
{:else if imageError}
	<!-- Placeholder when logo is not available -->
	<div class="flex items-center justify-center bg-muted rounded {sizeClasses[size]}">
		<span class="text-muted-foreground text-xs font-medium">{alt.charAt(0).toUpperCase()}</span>
	</div>
{:else}
	<img
		src={logoUrl}
		{alt}
		class="object-contain {sizeClasses[size]}"
		loading="lazy"
		decoding="async"
		onerror={handleError}
	/>
{/if}
