<script lang="ts">
	import { browser } from '$app/environment';
	import { isCloudMode, apiBaseUrl } from '$lib/stores/environment';
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

		if ($isCloudMode) {
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

			// In cloud mode, logos are served from the cloud API
			// The src contains the logo_slug (e.g., "3d_prima_basic_logo_png_b73af01c.png")
			// Format: /api/v1/brands/logo/{logo_slug} or /api/v1/stores/logo/{logo_slug}
			return `${$apiBaseUrl}/api/v1/${type}s/logo/${src}`;
		} else {
			// In local mode, use local API endpoint
			// ID should be the slug/directory name
			return `/api/${type}s/${id}/logo/${src}`;
		}
	});

	// Handle image load errors (logo not available in cloud mode)
	let imageError = $state(false);

	function handleError() {
		imageError = true;
	}
</script>

{#if !browser}
	<!-- Show placeholder during SSR -->
	<div class="flex items-center justify-center bg-gray-200 rounded {sizeClasses[size]}">
		<span class="text-gray-500 text-xs font-medium">{alt.charAt(0).toUpperCase()}</span>
	</div>
{:else if imageError}
	<!-- Placeholder when logo is not available -->
	<div class="flex items-center justify-center bg-gray-200 rounded {sizeClasses[size]}">
		<span class="text-gray-500 text-xs font-medium">{alt.charAt(0).toUpperCase()}</span>
	</div>
{:else}
	<img
		src={logoUrl}
		{alt}
		class="object-contain {sizeClasses[size]}"
		onerror={handleError}
	/>
{/if}
