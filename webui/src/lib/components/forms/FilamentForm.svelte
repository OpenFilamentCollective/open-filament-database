<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { SchemaForm, SlicerConfigPanel } from '$lib/components/forms';
	import { FormSection, SustainabilityEditor, MechanicalEditor } from '$lib/components/form-fields';
	import {
		SLICER_KEYS,
		initializeSlicerForm,
		buildSlicerSettings,
		initializeSlicerEnabled,
		initializeSlicerForms,
		type SlicerKey
	} from '$lib/config/slicerConfig';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';
	import { FixHint } from '$lib/components/ui';
	import { formDrafts } from '$lib/stores/formDrafts';
	import { generateSlug } from '$lib/services/entityService';
	import { useSettledField } from '$lib/utils/settledField.svelte';
	import { looksLikeProductPage, stripTrackersDeep } from '$lib/utils/urlSanitizer';
	import { pruneSustainability, type Entry, type JsonSchema } from '$lib/utils/sustainability';
	import { pruneMechanical } from '$lib/utils/mechanical';
	import type { Sustainability } from '$lib/types/database';
	import {
		checkNameLeadingCase,
		checkNameWhitespace,
		checkPlaceholderEntries,
		findDuplicateName,
		findInvertedRanges
	} from '$lib/utils/dataQuality';
	import { loadSearchIndex, layerChanges } from '$lib/services/searchIndex';
	import type { SearchRecord } from '$lib/types/search';
	import { changesList } from '$lib/stores/changes';
	import { submittedStore, submittedCount } from '$lib/stores/submitted';
	import { useChangeTracking } from '$lib/stores/environment';

	interface Props {
		filament?: any;
		schema?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
		/** Optional key for in-memory draft preservation across modal close/reopen */
		draftKey?: string;
		/**
		 * Owning brand's slug. Supplying it turns on the duplicate-name nudge (#281):
		 * the form checks the typed name against every other filament of this brand.
		 */
		brandId?: string;
		/** Owning material's type (e.g. PLA) — lets the nudge say where the clash sits. */
		materialType?: string;
		/**
		 * Change-tree path of the filament being edited, excluded from the duplicate
		 * scan so an edit doesn't flag itself. Left unset when creating (a duplicate,
		 * a paste and a fresh filament all still have to clear the existing names).
		 */
		selfPath?: string;
	}

	let {
		filament = null,
		schema: externalSchema,
		onSubmit,
		saving = false,
		draftKey,
		brandId,
		materialType,
		selfPath
	}: Props = $props();

	type FilamentDraft = {
		formData: Record<string, any>;
		slicerEnabled: Record<SlicerKey, boolean>;
		slicerData: Record<string, any>;
		sustainability?: Sustainability;
		mechanical?: Entry[];
	};

	// Internal schema state (loaded if not provided externally)
	let internalSchema: any = $state(null);
	let schema = $derived(externalSchema || internalSchema);

	// Load schema on mount if not provided
	onMount(async () => {
		if (!externalSchema) {
			internalSchema = await fetchEntitySchema('filament');
		}
	});

	// `sustainability` is a cross-file $ref, edited by SustainabilityEditor rather than
	// SchemaForm, which renders flat fields only.
	let sustainabilitySchema: any = $state(null);
	onMount(async () => {
		sustainabilitySchema = await fetchEntitySchema('sustainability');
	});

	// `mechanical` is the same: a cross-file $ref edited by MechanicalEditor.
	let mechanicalSchema: JsonSchema | null = $state(null);
	onMount(async () => {
		mechanicalSchema = await fetchEntitySchema('mechanical');
	});

	// Config for filament form - labels, tooltips, and placeholders come from schema
	const config: SchemaFormConfig = {
		splitAfterKey: 'discontinued',
		leftWidth: '2/3',
		leftSpacing: 'sm',
		// `uuid` is the canonical id assigned by CI on merge — never shown or edited here.
		hiddenFields: [
			'id',
			'uuid',
			'moved_from',
			'slicer_settings',
			'slicer_ids',
			'sustainability',
			'mechanical'
		],
		fieldOrder: [
			'name',
			'density',
			'diameter_tolerance',
			'min_print_temperature',
			'max_print_temperature',
			'min_bed_temperature',
			'max_bed_temperature',
			'preheat_temperature',
			'max_dry_temperature',
			'min_chamber_temperature',
			'max_chamber_temperature',
			'chamber_temperature',
			'min_print_speed',
			'max_print_speed',
			'max_volumetric_speed',
			'enclosure',
			'min_fan_speed',
			'max_fan_speed',
			'dry_temperature',
			'dry_time',
			'shore_hardness_a',
			'shore_hardness_d',
			'min_nozzle_diameter',
			'certifications',
			'data_sheet_url',
			'safety_sheet_url',
			'discontinued'
		],
		fieldGroups: [
			['density', 'diameter_tolerance'],
			['min_print_temperature', 'max_print_temperature'],
			['min_bed_temperature', 'max_bed_temperature'],
			['preheat_temperature', 'max_dry_temperature'],
			['min_chamber_temperature', 'max_chamber_temperature'],
			['min_print_speed', 'max_print_speed'],
			['max_volumetric_speed', 'enclosure'],
			['min_fan_speed', 'max_fan_speed'],
			['dry_temperature', 'dry_time'],
			['shore_hardness_a', 'shore_hardness_d'],
			['data_sheet_url', 'safety_sheet_url']
		],
		typeOverrides: {
			certifications: 'stringList'
		},
		steps: {
			density: 0.01,
			diameter_tolerance: 0.001,
			min_nozzle_diameter: 0.1,
			max_volumetric_speed: 0.5,
			dry_time: 0.5
		}
	};

	// Tooltip for slicer settings section (not from schema since it's a custom section)
	const SLICER_TOOLTIP = 'Configure slicer profiles and temperature overrides for different slicing software.';

	// Prepare schema - remove id field
	let preparedSchema = $derived(schema ? removeIdFromSchema(schema) : null);

	// Restore from draft if one exists for this draftKey
	const initialDraft = draftKey ? formDrafts.get<FilamentDraft>(draftKey) : undefined;

	// Form data state - initialized when schema is available
	let formData = $state<Record<string, any>>(initialDraft?.formData ?? {});

	function cloneSustainability(value: Sustainability | undefined): Sustainability {
		return value ? JSON.parse(JSON.stringify(value)) : {};
	}

	let sustainability = $state<Sustainability>(
		initialDraft?.sustainability ?? cloneSustainability(filament?.sustainability)
	);

	function cloneMechanical(value: Entry[] | undefined): Entry[] {
		return value ? JSON.parse(JSON.stringify(value)) : [];
	}

	let mechanical = $state<Entry[]>(
		initialDraft?.mechanical ?? cloneMechanical(filament?.mechanical)
	);

	// Folder-id drift guard: an existing filament whose folder id carries extra trailing
	// tokens beyond its name (e.g. name "Fluorescence PLA" but folder `fluorescence_pla_orange`
	// — a stray colour baked into the id). Surfaced as a non-blocking notice; renaming the
	// folder moves every child variant so it is intentionally not a one-click action here.
	let idDrift = $derived.by(() => {
		const currentId: string = filament?.slug || filament?.id || '';
		const name: string = formData?.name || '';
		if (!currentId || !name) return null;
		const expected = generateSlug(name);
		if (expected && currentId !== expected && currentId.startsWith(expected + '_')) {
			return { currentId, expected };
		}
		return null;
	});

	// The name hints below read this rather than formData.name, so they wait until the
	// contributor pauses or leaves the field instead of flashing up mid-word.
	const settledName = useSettledField(() => String(formData?.name ?? ''), 'name');

	// Stray whitespace in a name is invisible in review and survives into every
	// downstream consumer — #460 shipped a filament literally named "Silk ".
	let nameWhitespace = $derived(
		// A trailing space is normal mid-typing ("Test " on the way to "Test Blue").
		checkNameWhitespace(settledName.editing ? settledName.value.trimEnd() : settledName.value)
	);

	function fixNameWhitespace() {
		if (nameWhitespace) formData.name = nameWhitespace.suggestion;
	}

	// A display name that starts with a lowercase letter. Only the first letter is
	// changed — Title Casing the rest would rewrite manufacturer styling.
	let nameLeadingCase = $derived(checkNameLeadingCase(settledName.value));

	function fixNameLeadingCase() {
		if (nameLeadingCase) formData.name = nameLeadingCase.suggestion;
	}

	/**
	 * A name already used by another filament of this brand (#281).
	 *
	 * Filaments are stored per material, so nothing on disk stops the same product from
	 * being entered twice under two materials — #280 shipped a PLA-CF that had landed in
	 * PETG beside the real one. The search index is the only brand-wide view of the tree
	 * the form can reach, so the check reads from it, with the contributor's staged edits
	 * layered on so a filament they created locally counts too.
	 *
	 * Non-blocking: it is a nudge, not a gate. Two genuinely different products can share
	 * a slug once punctuation is dropped, and the contributor is the one who knows.
	 */
	let brandRecords = $state<SearchRecord[]>([]);

	onMount(async () => {
		if (!brandId) return;
		try {
			brandRecords = await loadSearchIndex();
		} catch {
			// The index is optional context — losing it just means no nudge.
		}
	});

	const submittedChanges = $derived.by(() => {
		void $submittedCount;
		return submittedStore.getEntries().flatMap((e) => e.changes);
	});

	let brandFilaments = $derived.by(() => {
		if (!brandId) return [];
		const records = $useChangeTracking
			? layerChanges(brandRecords, $changesList, submittedChanges)
			: brandRecords;
		const brand = brandId.toLowerCase();
		const self = selfPath?.toLowerCase();
		return records
			.filter(
				(r) =>
					r.type === 'filament' &&
					(r.brandSlug ?? '').toLowerCase() === brand &&
					r.path.toLowerCase() !== self
			)
			.map((r) => ({
				name: r.name,
				// The folder id, which is what actually collides — the display name only
				// slugifies back to it when the two were never allowed to drift.
				slug: r.path.split('/').pop() ?? '',
				materialType: r.materialType ?? '',
				href: r.href
			}));
	});

	let nameDuplicate = $derived(findDuplicateName(settledName.value, brandFilaments));

	// `certifications: [""]` (#453) reads downstream as a certification with a blank
	// name; an empty list says the true thing.
	let blankCertifications = $derived(checkPlaceholderEntries(formData?.certifications));

	function fixBlankCertifications() {
		const drop = new Set(blankCertifications);
		formData.certifications = (formData.certifications as string[]).filter(
			(_, index) => !drop.has(index)
		);
	}

	// A min above its max (e.g. fan speed 80% - 20%) would be copied as-is into slicer
	// presets. Almost always the two values entered the wrong way round.
	let invertedRanges = $derived(findInvertedRanges(formData));

	function fixInvertedRanges() {
		for (const { low, high, lowValue, highValue } of invertedRanges) {
			formData[low] = highValue;
			formData[high] = lowValue;
		}
	}

	/**
	 * `data_sheet_url` and `safety_sheet_url` are meant to reach a TDS and an SDS — two
	 * different documents. 3dhojor's merged filament (#461) has both pointing at the same
	 * Shopify product page, which answers neither question and carries a colour-specific
	 * `?variant=` selector on a field describing the whole filament.
	 *
	 * Non-blocking: a few manufacturers really do publish specs only on the product page.
	 */
	let sheetIssue = $derived.by(() => {
		const dataSheet: string = formData?.data_sheet_url || '';
		const safetySheet: string = formData?.safety_sheet_url || '';

		if (dataSheet && safetySheet && dataSheet === safetySheet) {
			return 'The datasheet and safety datasheet are the same link. These are normally two different documents (TDS and SDS) — link each one, or leave the one you do not have blank.';
		}

		const productPages = [
			dataSheet && looksLikeProductPage(dataSheet) ? 'datasheet' : null,
			safetySheet && looksLikeProductPage(safetySheet) ? 'safety datasheet' : null
		].filter(Boolean);

		if (productPages.length > 0) {
			return `The ${productPages.join(' and ')} link${productPages.length > 1 ? 's point' : ' points'} at a shop product page rather than a document. Link the PDF if the manufacturer publishes one, or leave it blank.`;
		}

		return null;
	});

	// Slicer toggle state
	let slicerEnabled = $state<Record<SlicerKey, boolean>>(
		initialDraft?.slicerEnabled ?? initializeSlicerEnabled(filament?.slicer_settings)
	);

	// Slicer settings forms
	let slicerForms = $state<Record<SlicerKey, any>>(initializeSlicerForms());
	{
		const initialSlicerSettings = initialDraft?.slicerData ?? filament?.slicer_settings;
		for (const key of SLICER_KEYS) {
			if (slicerEnabled[key]) {
				slicerForms[key] = initializeSlicerForm(key, initialSlicerSettings?.[key] ?? {});
			}
		}
	}

	// Track entity and schema changes to reinitialize form data
	// NOTE: must be plain variables, NOT $state — proxy identity breaks !== comparisons.
	let lastEntity: any = filament;
	let lastSchema: any = null;
	// If we restored from a draft, treat the current schema/entity as the baseline
	// so the first $effect.pre run doesn't clobber the restored draft.
	let draftRestored = !!initialDraft;

	// Use $effect.pre to ensure formData is initialized before DOM renders
	$effect.pre(() => {
		// Reinitialize when schema becomes available or entity changes
		const prevEntity = untrack(() => lastEntity);
		const prevSchema = untrack(() => lastSchema);
		if (preparedSchema && (preparedSchema !== prevSchema || filament !== prevEntity)) {
			lastEntity = filament;
			lastSchema = preparedSchema;
			if (draftRestored) {
				// Skip the schema/entity-change reinit on the first pass — the draft
				// is already populated. Subsequent prop changes will reinit normally.
				draftRestored = false;
				return;
			}
			formData = initializeFormData(preparedSchema, filament, config.hiddenFields);
			sustainability = cloneSustainability(filament?.sustainability);
			mechanical = cloneMechanical(filament?.mechanical);
			slicerEnabled = initializeSlicerEnabled(filament?.slicer_settings);
			slicerForms = initializeSlicerForms();
			// Pre-create forms for already-enabled slicers
			for (const key of SLICER_KEYS) {
				if (slicerEnabled[key]) {
					const initialValue = filament?.slicer_settings?.[key] || {};
					slicerForms[key] = initializeSlicerForm(key, initialValue);
				}
			}
		}
	});

	// Persist form state to the in-memory draft store on every change.
	$effect(() => {
		if (!draftKey) return;
		formDrafts.set(draftKey, {
			formData,
			slicerEnabled,
			slicerData: buildSlicerSettings(slicerEnabled, slicerForms),
			sustainability: $state.snapshot(sustainability),
			mechanical: $state.snapshot(mechanical)
		});
	});

	// Toggle slicer
	function toggleSlicer(key: SlicerKey) {
		slicerEnabled[key] = !slicerEnabled[key];
		if (slicerEnabled[key] && !slicerForms[key]) {
			const initialValue = filament?.slicer_settings?.[key] || {};
			slicerForms[key] = initializeSlicerForm(key, initialValue);
		}
	}

	// Handle form submission
	function handleSubmit(data: any) {
		// Build submit data using generic utility
		const submitData = buildSubmitData(preparedSchema, data, config.hiddenFields, undefined, config.transforms);

		// Handle slicer settings separately (complex nested object)
		const slicer_settings = buildSlicerSettings(slicerEnabled, slicerForms);
		if (Object.keys(slicer_settings).length > 0) {
			submitData.slicer_settings = slicer_settings;
		}

		// Undefined when empty so the spread in the parent page wipes a removed block.
		// Without the schema the editor is hidden, so keep the stored value untouched.
		if (sustainabilitySchema) {
			const sustainabilityData = pruneSustainability(
				$state.snapshot(sustainability),
				sustainabilitySchema
			);
			submitData.sustainability = sustainabilityData
				? stripTrackersDeep(sustainabilityData)
				: undefined;
		} else if (filament?.sustainability) {
			submitData.sustainability = filament.sustainability;
		}

		if (mechanicalSchema) {
			const mechanicalData = pruneMechanical($state.snapshot(mechanical), mechanicalSchema);
			submitData.mechanical = mechanicalData ? stripTrackersDeep(mechanicalData) : undefined;
		} else if (filament?.mechanical) {
			submitData.mechanical = filament.mechanical;
		}

		// Preserve the canonical UUID on edit; left empty on create for CI to assign.
		if (filament?.uuid) submitData.uuid = filament.uuid;
		// Preserve former UUIDs so old references still resolve after a move/merge.
		if (filament?.moved_from) submitData.moved_from = filament.moved_from;

		onSubmit(submitData);
	}

	// Check if form can be submitted (name, density, diameter_tolerance are required)
	let canSubmit = $derived(
		!!formData.name && formData.density !== undefined && formData.diameter_tolerance !== undefined
	);
</script>

{#if !preparedSchema}
	<div class="flex items-center justify-center h-32">
		<p class="text-muted-foreground">Loading form...</p>
	</div>
{:else}
{#if nameWhitespace}
	<FixHint
		level="error"
		fixLabel="Fix"
		onFix={fixNameWhitespace}
		fixTitle="Trim the name to “{nameWhitespace.suggestion}”"
		class="mb-4"
	>
		The name {nameWhitespace.reason}. It will look identical to
		<strong>{nameWhitespace.suggestion}</strong> everywhere but count as a different filament.
	</FixHint>
{/if}
{#if nameLeadingCase}
	<FixHint
		fixLabel="Fix"
		onFix={fixNameLeadingCase}
		fixTitle="Rename to “{nameLeadingCase.suggestion}”"
		class="mb-4"
	>
		Filament names are shown capitalised everywhere they appear. Rename to
		<strong>{nameLeadingCase.suggestion}</strong>.
	</FixHint>
{/if}
{#if nameDuplicate}
	{@const dup = nameDuplicate.match}
	{@const sameMaterial =
		!!materialType && dup.materialType.toLowerCase() === materialType.toLowerCase()}
	{@const where = dup.materialType || 'another material'}
	<FixHint
		level={sameMaterial && nameDuplicate.kind === 'exact' ? 'error' : 'warn'}
		href={dup.href}
		hrefLabel="Open it ↗"
		class="mb-4"
	>
		{#if nameDuplicate.kind === 'word-order'}
			This brand already has <strong>{dup.name}</strong>{sameMaterial
				? ''
				: ` under ${where}`} — the same words in a different order. These are almost
			always the same product under two names.
		{:else if sameMaterial}
			This material already has a filament named <strong>{dup.name}</strong>. Add what is
			different about this one as a colour variant of it, or give it a name that tells the two
			apart.
		{:else}
			This brand already has a filament named <strong>{dup.name}</strong> under
			<strong>{where}</strong>. A filament name should identify one product across the
			whole brand — if this is that product, add the missing colours there instead of entering it
			again here.
		{/if}
	</FixHint>
{/if}
{#if blankCertifications.length > 0}
	<FixHint
		level="error"
		fixLabel={blankCertifications.length === 1 ? 'Remove it' : 'Remove them'}
		onFix={fixBlankCertifications}
		fixTitle="Drop the blank certification entries"
		class="mb-4"
	>
		{blankCertifications.length === 1 ? 'A certification entry is' : 'Some certification entries are'}
		blank. A blank entry reads downstream as a certification with no name — remove
		{blankCertifications.length === 1 ? 'it' : 'them'}, or fill
		{blankCertifications.length === 1 ? 'it' : 'them'} in.
	</FixHint>
{/if}
{#if invertedRanges.length > 0}
	<FixHint
		level="error"
		fixLabel="Swap"
		onFix={fixInvertedRanges}
		fixTitle="Swap each pair so the lower value comes first"
		class="mb-4"
	>
		{#each invertedRanges as range, i (range.low)}
			{i > 0 ? ' ' : ''}<code>{range.low}</code> ({range.lowValue}) is greater than
			<code>{range.high}</code> ({range.highValue}).
		{/each}
		The values are probably swapped.
	</FixHint>
{/if}
{#if sheetIssue}
	<FixHint message={sheetIssue} class="mb-4" />
{/if}
{#if idDrift}
	<FixHint class="mb-4">
		This filament's folder id is <strong>{idDrift.currentId}</strong> but its name suggests
		<strong>{idDrift.expected}</strong> — a stray token (likely a colour) is baked into the id.
		Renaming the folder moves every colour variant, so fix it by recreating the filament with a
		clean name or renaming the <code>{idDrift.currentId}</code> directory in a PR.
	</FixHint>
{/if}
<SchemaForm
	schema={preparedSchema}
	bind:data={formData}
	{config}
	{saving}
	submitLabel={filament?.id ? 'Update Filament' : 'Create Filament'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet afterFields()}
		<FormSection
			title="Slicer Settings"
			tooltip={SLICER_TOOLTIP}
		>
			<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} togglesOnly />
		</FormSection>
		{#if sustainabilitySchema}
			<FormSection title="Sustainability" tooltip={sustainabilitySchema.description}>
				<SustainabilityEditor
					bind:value={sustainability}
					schema={sustainabilitySchema}
					idPrefix="filament-sustainability"
				/>
			</FormSection>
		{/if}
		{#if mechanicalSchema}
			<FormSection title="Mechanical Properties" tooltip={mechanicalSchema.description}>
				<MechanicalEditor
					bind:value={mechanical}
					schema={mechanicalSchema}
					idPrefix="filament-mechanical"
				/>
			</FormSection>
		{/if}
	{/snippet}

	{#snippet rightColumnContent()}
		<SlicerConfigPanel {slicerEnabled} {slicerForms} onToggle={toggleSlicer} panelOnly />
	{/snippet}
</SchemaForm>
{/if}
