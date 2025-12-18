<script lang="ts">
	import type { MaterialIndex } from '$lib/server/dataIndex';

	interface Props {
		material: MaterialIndex;
		brandName: string;
	}

	let { material, brandName }: Props = $props();

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

	const colorClass = materialColors[material.data.material] || materialColors.default;
</script>

<a
	href="/brands/{encodeURIComponent(brandName)}/{encodeURIComponent(material.name)}"
	class="group block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-all hover:border-blue-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
>
	<div class="flex items-center justify-between">
		<div>
			<span class="inline-block rounded-full px-3 py-1 text-sm font-medium {colorClass}">
				{material.data.material}
			</span>
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
