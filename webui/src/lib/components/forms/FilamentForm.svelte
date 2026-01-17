<script lang="ts">
	import { BasicForm } from '@sjsf/form';
	import {
		TextField,
		NumberField,
		CheckboxField,
		ToggleField,
		Tooltip
	} from '$lib/components/form-fields';
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
	import { buildOptionalFields } from '$lib/utils/formUtils';

	interface Props {
		filament?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { filament = null, onSubmit, saving = false }: Props = $props();

	// Tooltip descriptions
	const TOOLTIPS: Record<string, string> = {
		name: 'The manufacturer\'s name for this filament (e.g., "PolyLite PLA").',
		density: 'The density of the filament in g/cm³. Used for weight calculations. Default PLA: ~1.24.',
		diameter_tolerance: 'The diameter tolerance in mm (e.g., ±0.02).',
		min_print_temperature: 'Minimum recommended nozzle temperature for printing (°C).',
		max_print_temperature: 'Maximum recommended nozzle temperature for printing (°C).',
		min_bed_temperature: 'Minimum recommended bed temperature (°C).',
		max_bed_temperature: 'Maximum recommended bed temperature (°C).',
		preheat_temperature: 'Recommended nozzle temperature for preheating/load cell bed leveling (°C).',
		max_dry_temperature: 'Maximum temperature (°C) for drying without degradation.',
		shore_hardness_a: 'Hardness on Shore A scale (for flexible materials, typically 20-95).',
		shore_hardness_d: 'Hardness on Shore D scale (for rigid materials, typically 20-90).',
		min_nozzle_diameter: 'Minimum nozzle diameter recommended for this material (mm).',
		certifications: 'Certifications the material has (e.g., food-safe, medical-grade).',
		data_sheet_url: 'URL to the manufacturer\'s technical data sheet.',
		safety_sheet_url: 'URL to the safety data sheet (SDS/MSDS).',
		discontinued: 'Mark if this filament has been discontinued by the manufacturer.',
		slicer_settings: 'Configure slicer profiles and temperature overrides for different slicing software.'
	};

	// Form data state
	let formData = $state({
		name: filament?.name || '',
		density: filament?.density ?? 1.24,
		diameter_tolerance: filament?.diameter_tolerance ?? 0.02,
		min_print_temperature: filament?.min_print_temperature || undefined,
		max_print_temperature: filament?.max_print_temperature || undefined,
		min_bed_temperature: filament?.min_bed_temperature || undefined,
		max_bed_temperature: filament?.max_bed_temperature || undefined,
		preheat_temperature: filament?.preheat_temperature || undefined,
		max_dry_temperature: filament?.max_dry_temperature || undefined,
		shore_hardness_a: filament?.shore_hardness_a || undefined,
		shore_hardness_d: filament?.shore_hardness_d || undefined,
		min_nozzle_diameter: filament?.min_nozzle_diameter || undefined,
		certifications: filament?.certifications || [],
		data_sheet_url: filament?.data_sheet_url || '',
		safety_sheet_url: filament?.safety_sheet_url || '',
		discontinued: filament?.discontinued || false,
		slicer_settings: filament?.slicer_settings || {}
	});

	// Certification input
	let newCertification = $state('');

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initializeSlicerEnabled(filament?.slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());

	// Track which slicers have any enabled
	let hasAnySlicerEnabled = $derived(SLICER_KEYS.some((key) => slicerEnabled[key]));

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = formData.slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Add certification
	function addCertification() {
		if (newCertification.trim() && !formData.certifications.includes(newCertification.trim())) {
			formData.certifications = [...formData.certifications, newCertification.trim()];
			newCertification = '';
		}
	}

	// Remove certification
	function removeCertification(cert: string) {
		formData.certifications = formData.certifications.filter((c: string) => c !== cert);
	}

	// Handle form submission
	function handleSubmit() {
		// Build slicer settings using shared helper
		const slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);

		// Build submit data with required fields
		const submitData: any = {
			name: formData.name,
			density: formData.density,
			diameter_tolerance: formData.diameter_tolerance
		};

		// Add optional fields using helper
		const optionalFields = buildOptionalFields(formData, [
			'min_print_temperature',
			'max_print_temperature',
			'min_bed_temperature',
			'max_bed_temperature',
			'preheat_temperature',
			'max_dry_temperature',
			'shore_hardness_a',
			'shore_hardness_d',
			'min_nozzle_diameter',
			'certifications',
			'data_sheet_url',
			'safety_sheet_url'
		]);
		Object.assign(submitData, optionalFields);

		// Always include discontinued (even when false)
		submitData.discontinued = formData.discontinued;

		if (Object.keys(slicer_settings).length > 0) {
			submitData.slicer_settings = slicer_settings;
		}

		onSubmit(submitData);
	}

	// Initialize slicer forms for enabled slicers on mount
	$effect(() => {
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key] && !slicerForms[key]) {
				const initialValue = formData.slicer_settings?.[key] || {};
				slicerForms[key] = initializeSlicerForm(key, initialValue);
			}
		}
	});
</script>

<div class="flex gap-6 h-full">
	<!-- Left side: Main form -->
	<div class="w-2/3 space-y-3 flex flex-col overflow-y-auto overflow-x-hidden px-1">
		<!-- Name -->
		<TextField
			bind:value={formData.name}
			id="filament-name"
			label="Name"
			required
			tooltip={TOOLTIPS.name}
		/>

		<!-- Density and Diameter Tolerance - Row -->
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				bind:value={formData.density}
				id="density"
				label="Density (g/cm³)"
				required
				step={0.01}
				tooltip={TOOLTIPS.density}
			/>
			<NumberField
				bind:value={formData.diameter_tolerance}
				id="diameter-tolerance"
				label="Diameter Tolerance (mm)"
				required
				step={0.001}
				tooltip={TOOLTIPS.diameter_tolerance}
			/>
		</div>

		<!-- Print Temperature Range - Row -->
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				bind:value={formData.min_print_temperature}
				id="min-print-temp"
				label="Min Print Temp (°C)"
				placeholder="e.g., 190"
				tooltip={TOOLTIPS.min_print_temperature}
			/>
			<NumberField
				bind:value={formData.max_print_temperature}
				id="max-print-temp"
				label="Max Print Temp (°C)"
				placeholder="e.g., 220"
				tooltip={TOOLTIPS.max_print_temperature}
			/>
		</div>

		<!-- Bed Temperature Range - Row -->
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				bind:value={formData.min_bed_temperature}
				id="min-bed-temp"
				label="Min Bed Temp (°C)"
				placeholder="e.g., 50"
				tooltip={TOOLTIPS.min_bed_temperature}
			/>
			<NumberField
				bind:value={formData.max_bed_temperature}
				id="max-bed-temp"
				label="Max Bed Temp (°C)"
				placeholder="e.g., 70"
				tooltip={TOOLTIPS.max_bed_temperature}
			/>
		</div>

		<!-- Preheat and Max Dry Temperature - Row -->
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				bind:value={formData.preheat_temperature}
				id="preheat-temp"
				label="Preheat Temp (°C)"
				placeholder="e.g., 170"
				tooltip={TOOLTIPS.preheat_temperature}
			/>
			<NumberField
				bind:value={formData.max_dry_temperature}
				id="max-dry-temp"
				label="Max Dry Temp (°C)"
				placeholder="e.g., 55"
				tooltip={TOOLTIPS.max_dry_temperature}
			/>
		</div>

		<!-- Shore Hardness - Row -->
		<div class="grid grid-cols-2 gap-3">
			<NumberField
				bind:value={formData.shore_hardness_a}
				id="shore-hardness-a"
				label="Shore Hardness A"
				placeholder="e.g., 95"
				tooltip={TOOLTIPS.shore_hardness_a}
			/>
			<NumberField
				bind:value={formData.shore_hardness_d}
				id="shore-hardness-d"
				label="Shore Hardness D"
				placeholder="e.g., 55"
				tooltip={TOOLTIPS.shore_hardness_d}
			/>
		</div>

		<!-- Min Nozzle Diameter -->
		<NumberField
			bind:value={formData.min_nozzle_diameter}
			id="min-nozzle-diameter"
			label="Min Nozzle Diameter (mm)"
			step={0.1}
			placeholder="e.g., 0.4"
			tooltip={TOOLTIPS.min_nozzle_diameter}
		/>

		<!-- Certifications -->
		<div>
			<label class="flex items-center text-sm font-medium text-foreground mb-1">
				Certifications
				<Tooltip text={TOOLTIPS.certifications} />
			</label>
			<div class="flex gap-2 mb-2">
				<input
					type="text"
					bind:value={newCertification}
					onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCertification())}
					class="flex-1 px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring outline-none transition-colors"
					placeholder="Add certification..."
				/>
				<button
					type="button"
					onclick={addCertification}
					class="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80"
				>
					Add
				</button>
			</div>
			{#if formData.certifications.length > 0}
				<div class="flex flex-wrap gap-2">
					{#each formData.certifications as cert}
						<span
							class="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded text-sm"
						>
							{cert}
							<button
								type="button"
								onclick={() => removeCertification(cert)}
								class="hover:text-destructive"
							>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-4 w-4"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fill-rule="evenodd"
										d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
										clip-rule="evenodd"
									/>
								</svg>
							</button>
						</span>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Data Sheet URL and Safety Sheet URL - Row -->
		<div class="grid grid-cols-2 gap-3">
			<TextField
				bind:value={formData.data_sheet_url}
				id="data-sheet-url"
				label="Data Sheet URL"
				type="url"
				placeholder="https://..."
				tooltip={TOOLTIPS.data_sheet_url}
			/>
			<TextField
				bind:value={formData.safety_sheet_url}
				id="safety-sheet-url"
				label="Safety Sheet URL"
				type="url"
				placeholder="https://..."
				tooltip={TOOLTIPS.safety_sheet_url}
			/>
		</div>

		<!-- Discontinued -->
		<CheckboxField
			bind:checked={formData.discontinued}
			id="discontinued"
			label="Discontinued"
			tooltip={TOOLTIPS.discontinued}
		/>

		<!-- Slicer Toggles Section -->
		<div class="border-t pt-4 mt-2">
			<h3 class="flex items-center text-sm font-medium text-foreground mb-3">
				Slicer Settings
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
				disabled={saving || !formData.name || !formData.density || !formData.diameter_tolerance}
				class="w-full px-6 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{saving ? 'Saving...' : filament ? 'Update Filament' : 'Create Filament'}
			</button>
		</div>
	</div>

	<!-- Right side: Slicer settings forms -->
	<div class="w-1/3 border-l pl-4 flex flex-col min-w-0">
		<h3 class="text-sm font-medium text-foreground mb-3 flex-shrink-0">Slicer Configuration</h3>
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
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-12 w-12 text-muted-foreground mb-3"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="1.5"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<p class="text-sm text-muted-foreground">
						Enable a slicer toggle on the left to configure its settings here.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
