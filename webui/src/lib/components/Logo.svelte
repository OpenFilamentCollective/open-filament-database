<script lang="ts">
	import { browser } from '$app/environment';
	import { isCloudMode, apiBaseUrl } from '$lib/stores/environment';

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

	// Build logo URL based on environment mode
	const logoUrl = $derived.by(() => {
		if (!src || !browser) return ''; // Don't generate URL during SSR

		if ($isCloudMode) {
			// In cloud mode, logos are served from a centralized icons endpoint
			// Format: /api/v1/stores/icons/{slug}.{ext} or /api/v1/brands/icons/{slug}.{ext}
			// Extract extension from src (e.g., "logo.png" -> "png")
			const ext = src.split('.').pop() || 'png';
			return `${$apiBaseUrl}/api/v1/${type}s/icons/${id}.${ext}`;
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
