<script lang="ts">
	import type { MaterialIndex } from '$lib/server/dataIndex';
	import { overlayMaterial, getEffectiveUrl } from '$lib/dataOverlay';

	interface Props {
		material: MaterialIndex;
		brandName: string;
		isLocalOnly?: boolean;
	}

	let { material, brandName, isLocalOnly = false }: Props = $props();

	// Apply overlay to get effective data with local changes
	const overlay = $derived(overlayMaterial(material.data, brandName, material.name));
	const effectiveData = $derived(overlay.data);
	const hasLocalChanges = $derived(overlay.hasLocalChanges);

	// Build effective URL (handles renames)
	const href = $derived(getEffectiveUrl('material', brandName, material.name));

	const materialColors: Record<string, string> = {
		PLA: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
		PETG: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
		ABS: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
		ASA: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
		TPU: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
		Nylon: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
		PC: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
		default: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
	};

	const colorClass = $derived(materialColors[effectiveData.material] || materialColors.default);
</script>

<a
	{href}
	class="group block rounded-lg border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:bg-gray-800 {isLocalOnly ? 'border-green-400 dark:border-green-500' : hasLocalChanges ? 'border-amber-400 dark:border-amber-500' : 'border-gray-200 hover:border-blue-300 dark:border-gray-700'}"
>
	<div class="flex items-center justify-between">
		<div>
			<div class="flex items-center gap-2">
				<span class="inline-block rounded-full px-3 py-1 text-sm font-medium {colorClass}">
					{effectiveData.material}
				</span>
				{#if isLocalOnly}
					<span class="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900 dark:text-green-200">
						New
					</span>
				{:else if hasLocalChanges}
					<span
						class="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900 dark:text-amber-200"
					>
						Modified
					</span>
				{/if}
			</div>
			<p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
				{material.filaments.length} filament{material.filaments.length !== 1 ? 's' : ''}
			</p>
		</div>
		<svg
			class="h-5 w-5 text-gray-400 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>
	</div>
</a>
