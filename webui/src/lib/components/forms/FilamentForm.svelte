<script lang="ts">
	import { FilamentSchema, type Filament } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Filament;
		filamentPath: string;
		onSave?: () => void;
		onCancel?: () => void;
	}

	let { initialData, filamentPath, onSave, onCancel }: Props = $props();

	let formData = $state<Partial<Filament>>({
		name: initialData?.name ?? '',
		diameter_tolerance: initialData?.diameter_tolerance ?? 0.03,
		density: initialData?.density ?? 1.24,
		max_dry_temperature: initialData?.max_dry_temperature ?? null,
		data_sheet_url: initialData?.data_sheet_url ?? null,
		safety_sheet_url: initialData?.safety_sheet_url ?? null,
		discontinued: initialData?.discontinued ?? null
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function validate(): boolean {
		errors = {};
		const result = FilamentSchema.safeParse(formData);

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
		addChange(operation, `${filamentPath}/filament.json`, formData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.();
	}
</script>

<form onsubmit={handleSubmit} class="space-y-4">
	<div>
		<label for="name" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Filament Name *
		</label>
		<input
			type="text"
			id="name"
			bind:value={formData.name}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			class:border-red-500={errors.name}
		/>
		{#if errors.name}
			<p class="mt-1 text-sm text-red-600">{errors.name}</p>
		{/if}
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div>
			<label
				for="diameter_tolerance"
				class="block text-sm font-medium text-gray-700 dark:text-gray-300"
			>
				Diameter Tolerance (mm) *
			</label>
			<input
				type="number"
				id="diameter_tolerance"
				step="0.01"
				bind:value={formData.diameter_tolerance}
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				class:border-red-500={errors.diameter_tolerance}
			/>
			{#if errors.diameter_tolerance}
				<p class="mt-1 text-sm text-red-600">{errors.diameter_tolerance}</p>
			{/if}
		</div>

		<div>
			<label for="density" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
				Density (g/cm3)
			</label>
			<input
				type="number"
				id="density"
				step="0.01"
				bind:value={formData.density}
				class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
			/>
		</div>
	</div>

	<div>
		<label
			for="max_dry_temperature"
			class="block text-sm font-medium text-gray-700 dark:text-gray-300"
		>
			Max Dry Temperature (C)
		</label>
		<input
			type="number"
			id="max_dry_temperature"
			bind:value={formData.max_dry_temperature}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<div>
		<label for="data_sheet_url" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Data Sheet URL
		</label>
		<input
			type="url"
			id="data_sheet_url"
			bind:value={formData.data_sheet_url}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<div>
		<label for="safety_sheet_url" class="block text-sm font-medium text-gray-700 dark:text-gray-300">
			Safety Sheet URL
		</label>
		<input
			type="url"
			id="safety_sheet_url"
			bind:value={formData.safety_sheet_url}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<div class="flex items-center gap-2">
		<input
			type="checkbox"
			id="discontinued"
			bind:checked={formData.discontinued}
			class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
		/>
		<label for="discontinued" class="text-sm font-medium text-gray-700 dark:text-gray-300">
			Discontinued
		</label>
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
