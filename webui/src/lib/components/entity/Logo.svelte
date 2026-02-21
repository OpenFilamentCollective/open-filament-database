<script lang="ts">
	import { browser } from '$app/environment';
	import { useChangeTracking, isCloudMode, apiBaseUrl } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	interface Props {
		src: string;
		alt: string;
		type: 'store' | 'brand';
		id: string;
		size?: 'sm' | 'md' | 'lg';
	}

	let { src, alt, type, id, size = 'md' }: Props = $props();

	const sizeClasses = {
		sm: 'h-8 w-8',
		md: 'h-16 w-16',
		lg: 'h-24 w-24'
	};

	// Build logo URL based on environment mode, supporting base64 data URLs
	const logoUrl = $derived.by(() => {
		if (!src || !browser) return ''; // Don't generate URL during SSR

		// Support data URLs directly (base64 encoded images)
		if (src.startsWith('data:')) {
			return src;
		}

		// Check localStorage for staged image changes (both modes)
		if ($useChangeTracking) {
			// First, check if src is an image ID referencing stored base64 in change store
			// Subscribe to changeStore to make this reactive
			const imageRef = $changeStore.images[src];
			if (imageRef) {
				// Get the base64 data from localStorage
				try {
					const imageData = localStorage.getItem(imageRef.storageKey);
					if (imageData) {
						return `data:${imageRef.mimeType};base64,${imageData}`;
					}
				} catch (e) {
					console.error('Failed to retrieve image from localStorage:', e);
				}
			}

			// Also check if there's an image stored for this entity's logo property
			// This handles the case where we need to look up by entity path
			const entityPath = `${type}s/${id}`;
			for (const [, imgRef] of Object.entries($changeStore.images)) {
				if (imgRef.entityPath === entityPath && imgRef.property === 'logo') {
					try {
						const imageData = localStorage.getItem(imgRef.storageKey);
						if (imageData) {
							return `data:${imgRef.mimeType};base64,${imageData}`;
						}
					} catch (e) {
						console.error('Failed to retrieve image from localStorage:', e);
					}
				}
			}
		}

		// URL format depends on the data source, not change tracking
		if ($isCloudMode) {
			// Cloud: logos served via logo_slug
			return `${$apiBaseUrl}/api/${type}s/logo/${src}`;
		} else {
			// Local: logos served from entity directory
			return `/api/${type}s/${id}/logo/${src}`;
		}
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
		onerror={handleError}
	/>
{/if}
