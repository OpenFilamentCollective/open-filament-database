<script lang="ts">
	import { FilamentSizeArraySchema, type FilamentSize } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: FilamentSize[];
		sizesPath: string;
		onSave?: () => void;
		onCancel?: () => void;
	}

	let { initialData, sizesPath, onSave, onCancel }: Props = $props();

	let sizes = $state<Partial<FilamentSize>[]>(
		initialData && initialData.length > 0
			? initialData.map((s) => ({ ...s }))
			: [{ filament_weight: 1000, diameter: 1.75 }]
	);

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function addSize() {
		sizes = [...sizes, { filament_weight: 1000, diameter: 1.75 }];
	}

	function removeSize(index: number) {
		if (sizes.length > 1) {
			sizes = sizes.filter((_, i) => i !== index);
		}
	}

	function validate(): boolean {
		errors = {};
		const result = FilamentSizeArraySchema.safeParse(sizes);

		if (!result.success) {
			for (const issue of result.error.issues) {
				const path = issue.path.join('.');
				errors[path] = issue.message;
			}
			return false;
		}

		return true;
	}

	function handleSubmit(e: Event) {
		e.preventDefault();
		isSubmitting = true;

		if (!validate()) {
			isSubmitting = false;
			return;
		}

		const operation = initialData ? 'update' : 'create';
		addChange(operation, `${sizesPath}/sizes.json`, sizes as unknown as Record<string, unknown>);

		isSubmitting = false;
		onSave?.();
	}
</script>

<form onsubmit={handleSubmit} class="space-y-6">
	{#each sizes as size, index}
		<div class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
			<div class="mb-3 flex items-center justify-between">
				<h4 class="font-medium text-gray-900 dark:text-white">Size #{index + 1}</h4>
				{#if sizes.length > 1}
					<button
						type="button"
						onclick={() => removeSize(index)}
						class="text-sm text-red-600 hover:text-red-800 dark:text-red-400"
					>
						Remove
					</button>
				{/if}
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Filament Weight (g)
					</label>
					<input
						type="number"
						bind:value={size.filament_weight}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Diameter (mm)
					</label>
					<input
						type="number"
						step="0.01"
						bind:value={size.diameter}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Empty Spool Weight (g)
					</label>
					<input
						type="number"
						bind:value={size.empty_spool_weight}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Spool Core Diameter (mm)
					</label>
					<input
						type="number"
						step="0.1"
						bind:value={size.spool_core_diameter}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>
			</div>

			<div class="mt-4 grid grid-cols-2 gap-4">
				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">EAN</label>
					<input
						type="text"
						bind:value={size.ean}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>

				<div>
					<label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
						Article Number
					</label>
					<input
						type="text"
						bind:value={size.article_number}
						class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
					/>
				</div>
			</div>

			<div class="mt-4 flex items-center gap-2">
				<input
					type="checkbox"
					bind:checked={size.discontinued}
					class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
				/>
				<label class="text-sm font-medium text-gray-700 dark:text-gray-300">Discontinued</label>
			</div>
		</div>
	{/each}

	{#if Object.keys(errors).length > 0}
		<div class="rounded-md bg-red-50 p-3 dark:bg-red-900/20">
			<p class="text-sm text-red-700 dark:text-red-300">Please fix the validation errors above.</p>
		</div>
	{/if}

	<button
		type="button"
		onclick={addSize}
		class="w-full rounded-md border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-600 hover:border-gray-400 hover:text-gray-700 dark:border-gray-600 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300"
	>
		+ Add Size
	</button>

	<div class="flex gap-2 pt-4">
		<button
			type="submit"
			disabled={isSubmitting}
			class="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
		>
			{isSubmitting ? 'Saving...' : 'Save Changes'}
		</button>
		{#if onCancel}
			<button
				type="button"
				onclick={onCancel}
				class="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
			>
				Cancel
			</button>
		{/if}
	</div>
</form>
