<script lang="ts">
	import { MaterialSchema, type Material, type SlicerSettings } from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Material;
		materialPath: string;
		onSave?: (newMaterial: string) => void;
		onCancel?: () => void;
	}

	let { initialData, materialPath, onSave, onCancel }: Props = $props();

	// Extract generic settings from initial data
	const initialGeneric = initialData?.default_slicer_settings?.generic;

	let formData = $state({
		material: initialData?.material ?? '',
		default_max_dry_temperature: initialData?.default_max_dry_temperature ?? null,
		// Generic slicer settings
		nozzle_temp: initialGeneric?.nozzle_temp ?? null,
		bed_temp: initialGeneric?.bed_temp ?? null,
		first_layer_nozzle_temp: initialGeneric?.first_layer_nozzle_temp ?? null,
		first_layer_bed_temp: initialGeneric?.first_layer_bed_temp ?? null
	});

	// Build the full material object for saving
	function buildMaterialData(): Partial<Material> {
		const hasSlicerSettings =
			formData.nozzle_temp !== null ||
			formData.bed_temp !== null ||
			formData.first_layer_nozzle_temp !== null ||
			formData.first_layer_bed_temp !== null;

		const default_slicer_settings: SlicerSettings | null = hasSlicerSettings
			? {
					generic: {
						nozzle_temp: formData.nozzle_temp,
						bed_temp: formData.bed_temp,
						first_layer_nozzle_temp: formData.first_layer_nozzle_temp,
						first_layer_bed_temp: formData.first_layer_bed_temp
					}
				}
			: null;

		return {
			material: formData.material,
			default_max_dry_temperature: formData.default_max_dry_temperature,
			default_slicer_settings
		};
	}

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function validate(): boolean {
		errors = {};
		const materialData = buildMaterialData();
		const result = MaterialSchema.safeParse(materialData);

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

		const materialData = buildMaterialData();
		const operation = initialData ? 'update' : 'create';
		// For new materials, materialPath is just the brand name, so we need to add the material name
		// For existing materials, materialPath already includes the material name
		const path = initialData ? materialPath : `${materialPath}/${formData.material}`;
		addChange(operation, `${path}/material.json`, materialData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.(formData.material ?? '');
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
			Default Max Dry Temperature (°C)
		</label>
		<input
			type="number"
			id="default_max_dry_temperature"
			bind:value={formData.default_max_dry_temperature}
			class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
		/>
	</div>

	<fieldset class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<legend class="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
			Default Slicer Settings (Generic)
		</legend>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label
					for="nozzle_temp"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Nozzle Temp (°C)
				</label>
				<input
					type="number"
					id="nozzle_temp"
					bind:value={formData.nozzle_temp}
					placeholder="e.g., 210"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="bed_temp"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Bed Temp (°C)
				</label>
				<input
					type="number"
					id="bed_temp"
					bind:value={formData.bed_temp}
					placeholder="e.g., 60"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="first_layer_nozzle_temp"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					First Layer Nozzle Temp (°C)
				</label>
				<input
					type="number"
					id="first_layer_nozzle_temp"
					bind:value={formData.first_layer_nozzle_temp}
					placeholder="e.g., 215"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="first_layer_bed_temp"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					First Layer Bed Temp (°C)
				</label>
				<input
					type="number"
					id="first_layer_bed_temp"
					bind:value={formData.first_layer_bed_temp}
					placeholder="e.g., 65"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
		</div>
	</fieldset>

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
