<script lang="ts">
	import { MaterialSchema, type Material } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Material;
		materialPath: string;
		onSave?: () => void;
		onCancel?: () => void;
	}

	let { initialData, materialPath, onSave, onCancel }: Props = $props();

	let formData = $state<Partial<Material>>({
		material: initialData?.material ?? '',
		default_max_dry_temperature: initialData?.default_max_dry_temperature ?? null,
		default_slicer_settings: initialData?.default_slicer_settings ?? null
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function validate(): boolean {
		errors = {};
		const result = MaterialSchema.safeParse(formData);

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
		addChange(operation, `${materialPath}/material.json`, formData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.();
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="material" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Material Type *
		</label>
		<input
			type="text"
			id="material"
			bind:value={formData.material}
			placeholder="PLA, PETG, ABS, etc."
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.material}
		/>
		{#if errors.material}
			<p class="mt-1 text-sm text-red-600">{errors.material}</p>
		{/if}
	</div>

	<div>
		<label
			for="default_max_dry_temperature"
			class="block text-sm font-medium text-gray-700 dark:text-gray-300"
		>
			Default Max Dry Temperature (C)
		</label>
		<input
			type="number"
			id="default_max_dry_temperature"
			bind:value={formData.default_max_dry_temperature}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

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
