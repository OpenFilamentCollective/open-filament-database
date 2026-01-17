<script lang="ts">
	import { BasicForm } from '@sjsf/form';
	import { apiBaseUrl } from '$lib/stores/environment';
	import { get } from 'svelte/store';
	import { SelectField, NumberField, ToggleField, Tooltip } from '$lib/components/form-fields';
	import {
		SLICER_KEYS,
		SLICER_LABELS,
		SLICER_DESCRIPTIONS,
		initializeSlicerForm,
		buildSlicerSettings,
		initializeSlicerEnabled,
		initializeSlicerForms,
		type SlicerKey
	} from '$lib/config/slicerConfig';

	interface Props {
		material?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { material = null, onSubmit, saving = false }: Props = $props();

	// Material type enum values - fetched from API
	let materialTypes = $state<string[]>([]);
	let loadingMaterialTypes = $state(true);

	// Fetch material types from schema
	async function fetchMaterialTypes() {
		try {
			const baseUrl = get(apiBaseUrl);
			const response = await fetch(`${baseUrl}/api/v1/schemas/material_types_schema.json`);
			if (response.ok) {
				const schema = await response.json();
				if (schema.enum && Array.isArray(schema.enum)) {
					materialTypes = schema.enum;
				}
			}
		} catch (error) {
			console.error('Failed to fetch material types:', error);
		} finally {
			loadingMaterialTypes = false;
		}
	}

	// Fetch on mount
	$effect(() => {
		fetchMaterialTypes();
	});

	// Tooltip descriptions
	const TOOLTIPS = {
		material: 'The type of material (e.g., PLA, PETG, ABS). This determines the base properties and recommended settings.',
		material_class: 'The manufacturing process class. FFF (Fused Filament Fabrication) for standard filament printing, SLA for resin-based printing.',
		default_max_dry_temperature: 'Maximum temperature (in °C) that can be used to dry this material without degradation. Common values: PLA ~45°C, PETG ~65°C, ABS ~80°C.',
		slicer_settings: 'Configure default slicer profiles and temperature overrides for different slicing software. Toggle each slicer to configure its specific settings.'
	};

	// Form data state
	let formData = $state({
		material: material?.material || '',
		material_class: material?.material_class || '',
		default_max_dry_temperature: material?.default_max_dry_temperature || undefined,
		default_slicer_settings: material?.default_slicer_settings || {}
	});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initializeSlicerEnabled(material?.default_slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Track which slicers have any enabled
	let hasAnySlicerEnabled = $derived(
		SLICER_KEYS.some(key => slicerEnabled[key])
	);

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = formData.default_slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit() {
		// Build slicer settings using shared helper
		const default_slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);

		const submitData: any = {
			material: formData.material
		};

		// Only include material_class if it's set (not empty)
		if (formData.material_class) {
			submitData.material_class = formData.material_class;
		}

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
				const initialValue = formData.default_slicer_settings?.[key] || {};
				slicerForms[key] = initializeSlicerForm(key, initialValue);
			}
		}
	});
</script>

<div class="flex gap-6 h-full">
	<!-- Left side: Main form -->
	<div class="w-1/2 space-y-4 flex flex-col">
		<!-- Material Type Dropdown -->
		<SelectField
			bind:value={formData.material}
			id="material-type"
			label="Material Type"
			required
			tooltip={TOOLTIPS.material}
			disabled={loadingMaterialTypes}
		>
			{#if loadingMaterialTypes}
				<option value="">Loading material types...</option>
			{:else}
				<option value="">Select a material type...</option>
				{#each materialTypes as type}
					<option value={type}>{type}</option>
				{/each}
			{/if}
		</SelectField>

		<!-- Material Class -->
		<SelectField
			bind:value={formData.material_class}
			id="material-class"
			label="Material Class"
			tooltip={TOOLTIPS.material_class}
		>
			<option value="">Not set</option>
			<option value="FFF">FFF (Filament)</option>
			<option value="SLA">SLA (Resin)</option>
		</SelectField>

		<!-- Default Max Dry Temperature -->
		<NumberField
			bind:value={formData.default_max_dry_temperature}
			id="max-dry-temp"
			label="Default Max Dry Temperature (°C)"
			tooltip={TOOLTIPS.default_max_dry_temperature}
			placeholder="e.g., 55"
		/>

		<!-- Slicer Toggles Section -->
		<div class="border-t pt-4 mt-4">
			<h3 class="flex items-center text-sm font-medium text-foreground mb-3">
				Default Slicer Settings
				<Tooltip text={TOOLTIPS.slicer_settings} />
			</h3>
			<div class="flex flex-wrap gap-3">
				{#each SLICER_KEYS as key}
					<ToggleField
						bind:checked={slicerEnabled[key]}
						label={SLICER_LABELS[key]}
						tooltip={SLICER_DESCRIPTIONS[key]}
						onchange={() => toggleSlicer(key)}
					/>
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
				class="w-full px-6 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{saving ? 'Saving...' : (material ? 'Update Material' : 'Create Material')}
			</button>
		</div>
	</div>

	<!-- Right side: Slicer settings forms -->
	<div class="w-1/2 border-l pl-4 flex flex-col min-w-0">
		<h3 class="text-sm font-medium text-foreground mb-3 flex-shrink-0">
			Slicer Configuration
		</h3>
		<div class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
			{#if hasAnySlicerEnabled}
				{#each SLICER_KEYS as key}
					{#if slicerEnabled[key]}
						<div class="border border-border rounded-lg p-3">
							<h4 class="font-medium text-foreground mb-2 flex items-center gap-2 text-sm">
								<span class="w-2 h-2 rounded-full bg-primary flex-shrink-0"></span>
								<span class="truncate">{SLICER_LABELS[key]}</span>
							</h4>
							{#if slicerForms[key]}
								<div class="text-sm">
									<BasicForm form={slicerForms[key]} />
								</div>
							{:else}
								<div class="text-sm text-muted-foreground">Loading...</div>
							{/if}
						</div>
					{/if}
				{/each}
			{:else}
				<div class="flex flex-col items-center justify-center h-full text-center p-4">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-muted-foreground mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
					<p class="text-sm text-muted-foreground">Enable a slicer toggle on the left to configure its settings here.</p>
				</div>
			{/if}
		</div>
	</div>
</div>
