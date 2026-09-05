<script lang="ts">
	import { orcaBundleUrl, orcaProfileFilename, orcaProfileUrl } from '$lib/utils/orcaLinks';

	interface Props {
		/** Brand slug, as it appears in the API path. */
		brand: string;
		/** Brand display name. Falls back to the slug; only names the downloaded file. */
		brandName?: string;
		/** Material type. Omit for the brand-wide zip bundle. */
		material?: string;
		/** Filament slug. Omit for the brand-wide zip bundle. */
		filament?: string;
		/** Filament display name. Names the downloaded file, and decides
		 * exportability for materials that only reach a base through their name. */
		filamentName?: string;
		/** The brand's material types. Bundle only; decides whether a zip exists. */
		materials?: readonly string[];
		class?: string;
	}

	let {
		brand,
		brandName = '',
		material,
		filament,
		filamentName = '',
		materials = [],
		class: className = ''
	}: Props = $props();

	const isBundle = $derived(!material || !filament);

	// Null whenever PUBLIC_API_BASE_URL is unset — in local editor mode the
	// filament has not been published to the API yet, so there is nothing to link
	// — and null for anything the exporter skips, which would otherwise 404.
	const href = $derived(
		isBundle
			? orcaBundleUrl(brand, materials)
			: orcaProfileUrl(brand, material!, filament!, filamentName)
	);

	const download = $derived(
		isBundle
			? `${brand}-orcaslicer.zip`
			: orcaProfileFilename(brandName || brand, filamentName || filament!)
	);
</script>

{#if href}
	<div class={`space-y-1 ${className}`}>
		<a
			{href}
			{download}
			class="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
		>
			<svg
				class="h-3.5 w-3.5"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
				<polyline points="7 10 12 15 17 10" />
				<line x1="12" y1="15" x2="12" y2="3" />
			</svg>
			{isBundle ? 'All presets for OrcaSlicer (.zip)' : 'Download for OrcaSlicer'}
		</a>
		<p class="text-xs text-muted-foreground">
			Temperatures, density and diameter from this database; everything else is inherited from
			OrcaSlicer's generic profile.
			<a
				href="https://github.com/OpenFilamentCollective/open-filament-database/blob/main/docs/orcaslicer.md"
				target="_blank"
				rel="noopener noreferrer"
				class="underline underline-offset-2"
			>
				How to import
			</a>
		</p>
	</div>
{/if}
