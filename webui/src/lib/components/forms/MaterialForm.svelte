<script lang="ts">
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

	interface Props {
		material?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { material = null, onSubmit, saving = false }: Props = $props();

	// Tooltip state
	let activeTooltip: string | null = $state(null);

	// Material type enum values
	const MATERIAL_TYPES = [
		'PLA', 'PETG', 'TPU', 'ABS', 'ASA', 'PC', 'PCTG', 'PP',
		'PA6', 'PA11', 'PA12', 'PA66', 'CPE', 'TPE', 'HIPS', 'PHA',
		'PET', 'PEI', 'PBT', 'PVB', 'PVA', 'PEKK', 'PEEK', 'BVOH',
		'TPC', 'PPS', 'PPSU', 'PVC', 'PEBA', 'PVDF', 'PPA', 'PCL',
		'PES', 'PMMA', 'POM', 'PPE', 'PS', 'PSU', 'TPI', 'SBS', 'OBC', 'EVA'
	];

	// Field descriptions
	const FIELD_DESCRIPTIONS: Record<string, string> = {
		material: 'The type of material (e.g., PLA, PETG, ABS). This determines the base properties and recommended settings.',
		material_class: 'The manufacturing process class. FFF (Fused Filament Fabrication) for standard filament printing, SLA for resin-based printing.',
		default_max_dry_temperature: 'Maximum temperature (in °C) that can be used to dry this material without degradation. Common values: PLA ~45°C, PETG ~65°C, ABS ~80°C.',
		slicer_settings: 'Configure default slicer profiles and temperature overrides for different slicing software. Toggle each slicer to configure its specific settings.'
	};

	const SLICER_KEYS = ['prusaslicer', 'bambustudio', 'orcaslicer', 'cura', 'generic'] as const;
	type SlicerKey = typeof SLICER_KEYS[number];

	const SLICER_LABELS: Record<SlicerKey, string> = {
		prusaslicer: 'PrusaSlicer',
		bambustudio: 'Bambu Studio',
		orcaslicer: 'Orca Slicer',
		cura: 'Cura',
		generic: 'Generic'
	};

	const SLICER_DESCRIPTIONS: Record<SlicerKey, string> = {
		prusaslicer: 'Settings for PrusaSlicer and derivatives. Profile name references built-in or custom profiles.',
		bambustudio: 'Settings for Bambu Studio. Compatible with Bambu Lab printers and X1/P1 series.',
		orcaslicer: 'Settings for Orca Slicer. Fork of Bambu Studio with extended features.',
		cura: 'Settings for Ultimaker Cura. Uses Cura profile naming conventions.',
		generic: 'Generic temperature settings that apply across all slicers without profile references.'
	};

	// Form data state
	let formData = $state({
		material: material?.material || '',
		material_class: material?.material_class || 'FFF',
		default_max_dry_temperature: material?.default_max_dry_temperature || undefined,
		default_slicer_settings: material?.default_slicer_settings || {}
	});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>({
		prusaslicer: !!material?.default_slicer_settings?.prusaslicer,
		bambustudio: !!material?.default_slicer_settings?.bambustudio,
		orcaslicer: !!material?.default_slicer_settings?.orcaslicer,
		cura: !!material?.default_slicer_settings?.cura,
		generic: !!material?.default_slicer_settings?.generic
	});

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>({
		prusaslicer: null,
		bambustudio: null,
		orcaslicer: null,
		cura: null,
		generic: null
	});

	// Track which slicers have any enabled
	let hasAnySlicerEnabled = $derived(
		SLICER_KEYS.some(key => slicerEnabled[key])
	);

	// Schema for specific slicer settings (prusaslicer, bambustudio, orcaslicer, cura)
	function createSlicerSettingsSchema(isGeneric: boolean) {
		const baseProperties: Record<string, any> = {
			first_layer_bed_temp: { type: 'integer', title: 'First Layer Bed Temp' },
			first_layer_nozzle_temp: { type: 'integer', title: 'First Layer Nozzle Temp' },
			bed_temp: { type: 'integer', title: 'Bed Temp' },
			nozzle_temp: { type: 'integer', title: 'Nozzle Temp' }
		};

		if (!isGeneric) {
			return {
				type: 'object',
				properties: {
					profile_name: {
						type: 'string',
						title: 'Profile Name',
						description: 'The name of the profile for this filament'
					},
					overrides: {
						type: 'object',
						title: 'Overrides',
						additionalProperties: true,
						description: 'Key-value pairs for settings that should be overridden'
					},
					...baseProperties
				},
				required: ['profile_name']
			};
		}

		return {
			type: 'object',
			properties: baseProperties
		};
	}

	// Initialize slicer forms
	function initializeSlicerForm(key: SlicerKey) {
		const isGeneric = key === 'generic';
		const schema = createSlicerSettingsSchema(isGeneric);
		const initialValue = formData.default_slicer_settings?.[key] || {};

		slicerForms[key] = createForm({
			...formDefaults,
			schema: applyFormattedTitles(schema),
			uiSchema: {
				'ui:options': {
					submitButton: { class: 'hidden' }
				}
			},
			translation: customTranslation,
			initialValue,
			onSubmit: () => {} // We handle submission separately
		});
	}

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			initializeSlicerForm(key);
		}
	}

	// Get slicer form data
	function getSlicerData(key: SlicerKey): any {
		if (!slicerEnabled[key] || !slicerForms[key]) return undefined;
		return slicerForms[key].value;
	}

	// Handle form submission
	function handleSubmit() {
		// Build slicer settings
		const default_slicer_settings: Record<string, any> = {};
		for (const key of SLICER_KEYS) {
			const data = getSlicerData(key);
			if (data && Object.keys(data).length > 0) {
				// Only include if there's actual data
				const hasData = Object.values(data).some(v => v !== undefined && v !== '' && v !== null);
				if (hasData) {
					default_slicer_settings[key] = data;
				}
			}
		}

		const submitData: any = {
			material: formData.material,
			material_class: formData.material_class
		};

		if (formData.default_max_dry_temperature) {
			submitData.default_max_dry_temperature = formData.default_max_dry_temperature;
		}

		if (Object.keys(default_slicer_settings).length > 0) {
			submitData.default_slicer_settings = default_slicer_settings;
		}

		onSubmit(submitData);
	}

	// Initialize slicer forms for enabled slicers on mount
	$effect(() => {
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key] && !slicerForms[key]) {
				initializeSlicerForm(key);
			}
		}
	});
</script>

{#snippet infoIcon(fieldKey: string)}
	<button
		type="button"
		class="inline-flex items-center justify-center w-4 h-4 ml-1 text-gray-400 hover:text-purple-600 transition-colors relative"
		onmouseenter={() => activeTooltip = fieldKey}
		onmouseleave={() => activeTooltip = null}
		onfocus={() => activeTooltip = fieldKey}
		onblur={() => activeTooltip = null}
	>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
			<path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
		</svg>
		{#if activeTooltip === fieldKey && FIELD_DESCRIPTIONS[fieldKey]}
			<div class="absolute left-6 top-0 z-50 w-64 p-2 text-xs text-left text-white bg-gray-800 rounded-lg shadow-lg">
				{FIELD_DESCRIPTIONS[fieldKey]}
				<div class="absolute left-0 top-2 -translate-x-1 w-2 h-2 bg-gray-800 rotate-45"></div>
			</div>
		{/if}
	</button>
{/snippet}

<div class="flex gap-6 h-full">
	<!-- Left side: Main form -->
	<div class="w-1/2 space-y-4 flex flex-col">
		<!-- Material Type Dropdown -->
		<div>
			<label for="material-type" class="flex items-center text-sm font-medium text-gray-700 mb-1">
				Material Type <span class="text-red-500 ml-1">*</span>
				{@render infoIcon('material')}
			</label>
			<select
				id="material-type"
				bind:value={formData.material}
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
				required
			>
				<option value="">Select a material type...</option>
				{#each MATERIAL_TYPES as type}
					<option value={type}>{type}</option>
				{/each}
			</select>
		</div>

		<!-- Material Class -->
		<div>
			<label for="material-class" class="flex items-center text-sm font-medium text-gray-700 mb-1">
				Material Class
				{@render infoIcon('material_class')}
			</label>
			<select
				id="material-class"
				bind:value={formData.material_class}
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
			>
				<option value="FFF">FFF (Filament)</option>
				<option value="SLA">SLA (Resin)</option>
			</select>
		</div>

		<!-- Default Max Dry Temperature -->
		<div>
			<label for="max-dry-temp" class="flex items-center text-sm font-medium text-gray-700 mb-1">
				Default Max Dry Temperature (°C)
				{@render infoIcon('default_max_dry_temperature')}
			</label>
			<input
				id="max-dry-temp"
				type="number"
				bind:value={formData.default_max_dry_temperature}
				class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
				placeholder="e.g., 55"
			/>
		</div>

		<!-- Slicer Toggles Section -->
		<div class="border-t pt-4 mt-4">
			<h3 class="flex items-center text-sm font-medium text-gray-700 mb-3">
				Default Slicer Settings
				{@render infoIcon('slicer_settings')}
			</h3>
			<div class="flex flex-wrap gap-3">
				{#each SLICER_KEYS as key}
					<label class="inline-flex items-center cursor-pointer group relative">
						<input
							type="checkbox"
							checked={slicerEnabled[key]}
							onchange={() => toggleSlicer(key)}
							class="sr-only peer"
						/>
						<div class="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
						<span class="ms-2 text-sm font-medium text-gray-700">{SLICER_LABELS[key]}</span>
						<!-- Slicer tooltip on hover -->
						<div class="invisible group-hover:visible absolute left-0 top-8 z-50 w-56 p-2 text-xs text-white bg-gray-800 rounded-lg shadow-lg">
							{SLICER_DESCRIPTIONS[key]}
						</div>
					</label>
				{/each}
			</div>
		</div>

		<!-- Spacer to push submit button to bottom -->
		<div class="flex-1"></div>

		<!-- Submit Button -->
		<div class="pt-4">
			<button
				type="button"
				onclick={handleSubmit}
				disabled={saving || !formData.material}
				class="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{saving ? 'Saving...' : (material ? 'Update Material' : 'Create Material')}
			</button>
		</div>
	</div>

	<!-- Right side: Slicer settings forms -->
	<div class="w-1/2 border-l pl-4 flex flex-col min-w-0">
		<h3 class="text-sm font-medium text-gray-700 mb-3 flex-shrink-0">
			Slicer Configuration
		</h3>
		<div class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
			{#if hasAnySlicerEnabled}
				{#each SLICER_KEYS as key}
					{#if slicerEnabled[key]}
						<div class="border border-gray-200 rounded-lg p-3">
							<h4 class="font-medium text-gray-800 mb-2 flex items-center gap-2 text-sm">
								<span class="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0"></span>
								<span class="truncate">{SLICER_LABELS[key]}</span>
							</h4>
							{#if slicerForms[key]}
								<div class="text-sm">
									<BasicForm form={slicerForms[key]} />
								</div>
							{:else}
								<div class="text-sm text-gray-500">Loading...</div>
							{/if}
						</div>
					{/if}
				{/each}
			{:else}
				<div class="flex flex-col items-center justify-center h-full text-center p-4">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<p class="text-sm text-gray-500">Enable a slicer toggle on the left to configure its settings here.</p>
				</div>
			{/if}
		</div>
	</div>
</div>
