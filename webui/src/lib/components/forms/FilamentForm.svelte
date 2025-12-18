<script lang="ts">
	import {
		FilamentSchema,
		type Filament,
		type SlicerSettings,
		type SlicerIDs
	} from '$lib/schemas/generated';
	import { addChange } from '$lib/stores/changes.svelte';

	interface Props {
		initialData?: Filament;
		filamentPath: string;
		onSave?: (newName: string) => void;
		onCancel?: () => void;
	}

	let { initialData, filamentPath, onSave, onCancel }: Props = $props();

	// Extract nested data from initial data
	const initialGeneric = initialData?.slicer_settings?.generic;
	const initialSlicerIds = initialData?.slicer_ids;

	let formData = $state({
		name: initialData?.name ?? '',
		diameter_tolerance: initialData?.diameter_tolerance ?? 0.03,
		density: initialData?.density ?? 1.24,
		max_dry_temperature: initialData?.max_dry_temperature ?? null,
		data_sheet_url: initialData?.data_sheet_url ?? null,
		safety_sheet_url: initialData?.safety_sheet_url ?? null,
		discontinued: initialData?.discontinued ?? null,
		// Slicer IDs
		slicer_id_prusaslicer: initialSlicerIds?.prusaslicer ?? '',
		slicer_id_bambustudio: initialSlicerIds?.bambustudio ?? '',
		slicer_id_orcaslicer: initialSlicerIds?.orcaslicer ?? '',
		slicer_id_cura: initialSlicerIds?.cura ?? '',
		// Generic slicer settings
		nozzle_temp: initialGeneric?.nozzle_temp ?? null,
		bed_temp: initialGeneric?.bed_temp ?? null,
		first_layer_nozzle_temp: initialGeneric?.first_layer_nozzle_temp ?? null,
		first_layer_bed_temp: initialGeneric?.first_layer_bed_temp ?? null
	});

	// Build the full filament object for saving
	function buildFilamentData(): Partial<Filament> {
		// Build slicer_ids if any are set
		const hasSlicerIds =
			formData.slicer_id_prusaslicer ||
			formData.slicer_id_bambustudio ||
			formData.slicer_id_orcaslicer ||
			formData.slicer_id_cura;

		const slicer_ids: SlicerIDs | null = hasSlicerIds
			? {
					prusaslicer: formData.slicer_id_prusaslicer || null,
					bambustudio: formData.slicer_id_bambustudio || null,
					orcaslicer: formData.slicer_id_orcaslicer || null,
					cura: formData.slicer_id_cura || null
				}
			: null;

		// Build slicer_settings if any generic settings are set
		const hasSlicerSettings =
			formData.nozzle_temp !== null ||
			formData.bed_temp !== null ||
			formData.first_layer_nozzle_temp !== null ||
			formData.first_layer_bed_temp !== null;

		const slicer_settings: SlicerSettings | null = hasSlicerSettings
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
			name: formData.name,
			diameter_tolerance: formData.diameter_tolerance,
			density: formData.density,
			max_dry_temperature: formData.max_dry_temperature,
			data_sheet_url: formData.data_sheet_url,
			safety_sheet_url: formData.safety_sheet_url,
			discontinued: formData.discontinued,
			slicer_ids,
			slicer_settings
		};
	}

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);

	function validate(): boolean {
		errors = {};
		const filamentData = buildFilamentData();
		const result = FilamentSchema.safeParse(filamentData);

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

		const filamentData = buildFilamentData();
		const operation = initialData ? 'update' : 'create';
		// For new filaments, filamentPath is {brand}/{material}, so we need to add the filament name
		// For existing filaments, filamentPath already includes the filament name
		const path = initialData ? filamentPath : `${filamentPath}/${formData.name}`;
		addChange(operation, `${path}/filament.json`, filamentData as Record<string, unknown>);

		isSubmitting = false;
		onSave?.(formData.name ?? '');
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

	<fieldset class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<legend class="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
			Slicer IDs
		</legend>
		<div class="grid grid-cols-2 gap-4">
			<div>
				<label
					for="slicer_id_prusaslicer"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					PrusaSlicer
				</label>
				<input
					type="text"
					id="slicer_id_prusaslicer"
					bind:value={formData.slicer_id_prusaslicer}
					placeholder="e.g., Generic PLA @MINI"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="slicer_id_bambustudio"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Bambu Studio
				</label>
				<input
					type="text"
					id="slicer_id_bambustudio"
					bind:value={formData.slicer_id_bambustudio}
					placeholder="e.g., Bambu PLA Basic"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="slicer_id_orcaslicer"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					OrcaSlicer
				</label>
				<input
					type="text"
					id="slicer_id_orcaslicer"
					bind:value={formData.slicer_id_orcaslicer}
					placeholder="e.g., Generic PLA"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>

			<div>
				<label
					for="slicer_id_cura"
					class="block text-sm font-medium text-gray-700 dark:text-gray-300"
				>
					Cura
				</label>
				<input
					type="text"
					id="slicer_id_cura"
					bind:value={formData.slicer_id_cura}
					placeholder="e.g., generic_pla"
					class="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
				/>
			</div>
		</div>
	</fieldset>

	<fieldset class="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
		<legend class="px-2 text-sm font-medium text-gray-700 dark:text-gray-300">
			Slicer Settings (Generic)
		</legend>
		<p class="mb-3 text-xs text-gray-500 dark:text-gray-400">
			These override material-level defaults for this specific filament
		</p>
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
