<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { db } from '$lib/services/database';
	import type { Store, VariantSize, PurchaseLink } from '$lib/types/database';
	import { SchemaForm } from '$lib/components/forms';
	import { Tooltip, SizeCard } from '$lib/components/form-fields';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { TRAIT_CATEGORIES, findTraitByKey } from '$lib/config/traitConfig';
	import { PlusIcon, CloseIcon, CubeIcon, ChevronDownIcon } from '$lib/components/icons';
	import { toggleSetItem } from '$lib/utils/setHelpers';
	import { Button } from '$lib/components/ui';
	import { removeIdFromSchema } from '$lib/utils/schemaUtils';
	import { initializeFormData, buildSubmitData } from './schemaFormUtils';
	import type { SchemaFormConfig } from './schemaFormTypes';

	interface Props {
		variant?: any;
		schema?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { variant = null, schema: externalSchema, onSubmit, saving = false }: Props = $props();

	// Stores list for purchase link dropdowns
	let stores: Store[] = $state([]);

	// Internal schema state (loaded if not provided externally)
	let internalSchema: any = $state(null);
	let schema = $derived(externalSchema || internalSchema);

	// Load schema and stores on mount
	onMount(async () => {
		try {
			const [schemaData, storesData] = await Promise.all([
				externalSchema ? Promise.resolve(null) : fetchEntitySchema('variant'),
				db.loadStores()
			]);
			if (schemaData) internalSchema = schemaData;
			stores = storesData;
		} catch (e) {
			console.error('Failed to load data:', e);
		}
		initializeSizes();
	});

	// Config for variant form - labels, tooltips, and placeholders come from schema
	// Note: Schema uses 'name' but API expects 'color_name', so we use fieldMappings
	const config: SchemaFormConfig = {
		hiddenFields: ['id', 'traits', 'sizes', 'hex_variants', 'color_standards'],
		fieldOrder: ['name', 'color_hex', 'discontinued'],
		typeOverrides: {
			color_hex: 'color'
		},
		// Map schema 'name' field to API 'color_name' field
		fieldMappings: {
			name: 'color_name'
		}
	};

	// Tooltips for custom sections (not from schema since these are custom UI sections)
	const SECTION_TOOLTIPS = {
		traits: 'Select traits that describe this filament variant. Click to add/remove traits.',
		sizes: 'Different spool sizes and configurations available for this variant.'
	};

	// Prepare schema - remove id field
	let preparedSchema = $derived(schema ? removeIdFromSchema(schema) : null);

	// Form data state - initialized when schema is available
	let formData = $state<Record<string, any>>({});

	// Track entity and schema changes to reinitialize form data
	let lastEntity = $state<any>(variant);
	let lastSchema = $state<any>(null);

	// Use $effect.pre to ensure formData is initialized before DOM renders
	$effect.pre(() => {
		const prevEntity = untrack(() => lastEntity);
		const prevSchema = untrack(() => lastSchema);
		if (preparedSchema && (preparedSchema !== prevSchema || variant !== prevEntity)) {
			lastEntity = variant;
			lastSchema = preparedSchema;
			formData = initializeFormData(preparedSchema, variant, config.hiddenFields, config.fieldMappings, config.typeOverrides);
		}
	});

	// ==================== TRAITS HANDLING ====================

	// Traits state - set of selected trait keys
	let selectedTraits = $state<Set<string>>(
		new Set(
			variant?.traits
				? Object.entries(variant.traits)
						.filter(([_, v]) => v === true)
						.map(([k]) => k)
				: []
		)
	);

	// Trait search/filter
	let traitSearch = $state('');
	let expandedCategories = $state<Set<string>>(new Set(['appearance']));

	// Dropdown state for traits
	let showTraitDropdown = $state(false);
	let traitDropdownRef = $state<HTMLDivElement | null>(null);
	let dropdownMenuRef = $state<HTMLDivElement | null>(null);
	let addButtonRef = $state<HTMLSpanElement | null>(null);
	let dropdownPosition = $state({ top: 0, right: 0 });

	// Filter traits by search
	let filteredCategories = $derived.by(() => {
		if (!traitSearch.trim()) return TRAIT_CATEGORIES;

		const search = traitSearch.toLowerCase();
		const filtered: typeof TRAIT_CATEGORIES = {};

		for (const [catKey, category] of Object.entries(TRAIT_CATEGORIES)) {
			const matchingTraits = category.traits.filter(
				(t) => t.label.toLowerCase().includes(search) || t.description.toLowerCase().includes(search)
			);
			if (matchingTraits.length > 0) {
				filtered[catKey] = { ...category, traits: matchingTraits };
			}
		}
		return filtered;
	});

	// Toggle category expansion
	function toggleCategory(catKey: string) {
		expandedCategories = toggleSetItem(expandedCategories, catKey);
	}

	// Handle click outside to close dropdown
	function handleClickOutside(event: MouseEvent) {
		if (!showTraitDropdown) return;

		const target = event.target as Node;
		const clickedInSection = traitDropdownRef?.contains(target);
		const clickedInDropdown = dropdownMenuRef?.contains(target);

		if (!clickedInSection && !clickedInDropdown) {
			showTraitDropdown = false;
		}
	}

	// Toggle dropdown (with stop propagation to prevent immediate close)
	function toggleTraitDropdown(event: MouseEvent) {
		event.stopPropagation();
		if (!showTraitDropdown && addButtonRef) {
			const rect = addButtonRef.getBoundingClientRect();
			dropdownPosition = {
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right
			};
		}
		showTraitDropdown = !showTraitDropdown;
		if (showTraitDropdown) {
			traitSearch = '';
		}
	}

	// Remove trait
	function removeTrait(key: string) {
		selectedTraits.delete(key);
		selectedTraits = new Set(selectedTraits);
	}

	// Add trait from dropdown
	function addTrait(key: string) {
		selectedTraits.add(key);
		selectedTraits = new Set(selectedTraits);
	}

	// ==================== SIZES HANDLING ====================

	// Internal size type with ID for keying
	interface SizeWithId {
		id: number;
		value: {
			filament_weight: number | undefined;
			diameter: number;
			empty_spool_weight?: number;
			spool_core_diameter?: number;
			gtin?: string;
			article_number?: string;
			discontinued?: boolean;
			spool_refill?: boolean;
			purchase_links: Array<{ id: number; value: { store_id: string; url: string } }>;
		};
	}

	// Sizes state
	let sizes = $state<SizeWithId[]>([]);
	let nextSizeId = $state(1);
	let nextLinkId = $state(1);

	// Initialize sizes from variant data
	function initializeSizes() {
		if (variant?.sizes && Array.isArray(variant.sizes) && variant.sizes.length > 0) {
			sizes = variant.sizes.map((s: VariantSize, index: number) => ({
				id: index + 1,
				value: {
					filament_weight: s.filament_weight,
					diameter: s.diameter || 1.75,
					empty_spool_weight: s.empty_spool_weight,
					spool_core_diameter: s.spool_core_diameter,
					gtin: s.gtin || '',
					article_number: s.article_number || '',
					discontinued: s.discontinued || false,
					spool_refill: s.spool_refill || false,
					purchase_links: (s.purchase_links || []).map((pl: PurchaseLink, plIndex: number) => ({
						id: plIndex + 1,
						value: { store_id: pl.store_id || '', url: pl.url || '' }
					}))
				}
			}));
			nextSizeId = sizes.length + 1;
			let maxLinkId = 0;
			sizes.forEach((s) => {
				s.value.purchase_links.forEach((pl) => {
					if (pl.id > maxLinkId) maxLinkId = pl.id;
				});
			});
			nextLinkId = maxLinkId + 1;
		} else {
			sizes = [
				{
					id: 1,
					value: {
						filament_weight: undefined,
						diameter: 1.75,
						empty_spool_weight: undefined,
						spool_core_diameter: undefined,
						gtin: '',
						article_number: '',
						discontinued: false,
						spool_refill: false,
						purchase_links: []
					}
				}
			];
			nextSizeId = 2;
		}
	}

	// Add new size
	function addSize() {
		sizes = [
			...sizes,
			{
				id: nextSizeId++,
				value: {
					filament_weight: undefined,
					diameter: 1.75,
					empty_spool_weight: undefined,
					spool_core_diameter: undefined,
					gtin: '',
					article_number: '',
					discontinued: false,
					spool_refill: false,
					purchase_links: []
				}
			}
		];
	}

	// Remove size
	function removeSize(index: number) {
		sizes = sizes.filter((_, i) => i !== index);
	}

	// Add purchase link to a size
	function addPurchaseLink(sizeIndex: number) {
		const newLink = {
			id: nextLinkId++,
			value: { store_id: '', url: '' }
		};
		sizes[sizeIndex].value.purchase_links = [...sizes[sizeIndex].value.purchase_links, newLink];
	}

	// Remove purchase link from a size
	function removePurchaseLink(sizeIndex: number, linkIndex: number) {
		sizes[sizeIndex].value.purchase_links = sizes[sizeIndex].value.purchase_links.filter((_, i) => i !== linkIndex);
	}

	// ==================== FORM SUBMISSION ====================

	function handleSubmit(data: any) {
		// Validate required fields
		if (!data.name || !data.color_hex) {
			return;
		}

		if (sizes.length === 0) {
			return;
		}

		// Check that at least one size has required fields
		const validSizes = sizes.filter((s) => s.value.filament_weight !== undefined && s.value.diameter !== undefined);

		if (validSizes.length === 0) {
			return;
		}

		// Build sizes array for submission (strip internal IDs)
		const sizesData = validSizes.map((s) => {
			const sizeValue: any = {
				filament_weight: s.value.filament_weight,
				diameter: s.value.diameter
			};

			if (s.value.empty_spool_weight) sizeValue.empty_spool_weight = s.value.empty_spool_weight;
			if (s.value.spool_core_diameter) sizeValue.spool_core_diameter = s.value.spool_core_diameter;
			if (s.value.gtin) sizeValue.gtin = s.value.gtin;
			if (s.value.article_number) sizeValue.article_number = s.value.article_number;
			sizeValue.discontinued = s.value.discontinued ?? false;
			sizeValue.spool_refill = s.value.spool_refill ?? false;

			const validLinks = s.value.purchase_links
				.filter((pl) => pl.value.store_id && pl.value.url)
				.map((pl) => ({ store_id: pl.value.store_id, url: pl.value.url }));

			if (validLinks.length > 0) {
				sizeValue.purchase_links = validLinks;
			}

			return sizeValue;
		});

		// Build traits object (only include true values)
		const traitsData: Record<string, boolean> = {};
		for (const trait of selectedTraits) {
			traitsData[trait] = true;
		}

		// Build submit data using utility (handles field mappings automatically)
		const submitData = buildSubmitData(preparedSchema, data, config.hiddenFields, config.fieldMappings);

		// Add custom fields not handled by schema
		submitData.sizes = sizesData;
		if (Object.keys(traitsData).length > 0) {
			submitData.traits = traitsData;
		}

		onSubmit(submitData);
	}

	// Check if form can be submitted
	let canSubmit = $derived(
		!!formData.name && !!formData.color_hex && sizes.length > 0
	);
</script>

<svelte:window onclick={handleClickOutside} />

{#if !preparedSchema}
	<div class="flex items-center justify-center h-32">
		<p class="text-muted-foreground">Loading form...</p>
	</div>
{:else}
<SchemaForm
	schema={preparedSchema}
	bind:data={formData}
	{config}
	{saving}
	submitLabel={variant ? 'Update Variant' : 'Create Variant'}
	submitDisabled={!canSubmit}
	onSubmit={handleSubmit}
>
	{#snippet afterFields()}
		<!-- Traits Section -->
		<div class="border-t pt-4 mt-2" bind:this={traitDropdownRef}>
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-sm font-medium text-foreground flex items-center">
					Traits
					<Tooltip text={SECTION_TOOLTIPS.traits} />
				</h3>
				<span bind:this={addButtonRef}>
					<Button
						variant="outline"
						size="sm"
						onclick={toggleTraitDropdown}
						class="border-dashed"
					>
						<PlusIcon class="h-3 w-3" />
						Add
					</Button>
				</span>
			</div>

			<!-- Selected traits as tiles -->
			<div class="flex flex-wrap gap-1.5">
				{#each [...selectedTraits] as traitKey}
					{@const traitInfo = findTraitByKey(traitKey)}
					<Button
						variant="secondary"
						size="sm"
						onclick={() => removeTrait(traitKey)}
						class="h-7 rounded-full px-3 text-xs"
						title="Click to remove: {traitInfo?.description}"
					>
						{traitInfo?.label || traitKey}
						<CloseIcon class="h-3 w-3" />
					</Button>
				{/each}
				{#if selectedTraits.size === 0}
					<span class="text-xs text-muted-foreground">No traits selected</span>
				{/if}
			</div>

			<!-- Dropdown menu -->
			{#if showTraitDropdown}
				<div
					bind:this={dropdownMenuRef}
					class="fixed w-72 bg-popover border border-border rounded-lg shadow-lg z-100 max-h-80 overflow-hidden flex flex-col"
					style="top: {dropdownPosition.top}px; right: {dropdownPosition.right}px;"
					role="listbox"
					aria-label="Select traits"
					onkeydown={(e) => e.key === 'Escape' && (showTraitDropdown = false)}
				>
					<div class="p-2 border-b border-border">
						<input
							type="text"
							bind:value={traitSearch}
							placeholder="Search traits..."
							class="w-full px-2 py-1.5 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
						/>
					</div>

					<div class="overflow-y-auto flex-1 p-1">
						{#each Object.entries(filteredCategories) as [catKey, category]}
							{@const unselectedTraits = category.traits.filter((t) => !selectedTraits.has(t.key))}
							{#if unselectedTraits.length > 0}
								<div class="mb-1">
									<Button
										variant="ghost"
										size="sm"
										onclick={() => toggleCategory(catKey)}
										class="w-full h-auto justify-between px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
									>
										<span>{category.label}</span>
										<ChevronDownIcon
											class="h-3 w-3 transition-transform {expandedCategories.has(catKey) ? 'rotate-180' : ''}"
										/>
									</Button>
									{#if expandedCategories.has(catKey)}
										<div class="pl-2 py-1 space-y-0.5">
											{#each unselectedTraits as trait}
												<Button
													variant="ghost"
													size="sm"
													onclick={() => addTrait(trait.key)}
													class="w-full h-auto justify-start px-2 py-1 text-xs hover:bg-primary/10"
													title={trait.description}
												>
													<PlusIcon class="h-3 w-3 text-muted-foreground" />
													{trait.label}
												</Button>
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						{/each}

						{#if Object.keys(filteredCategories).length === 0}
							<div class="text-center py-4 text-sm text-muted-foreground">No traits found</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet rightColumnContent()}
		<div class="flex items-center justify-between mb-3 shrink-0">
			<h3 class="text-sm font-medium text-foreground flex items-center">
				Sizes <span class="text-destructive ml-1">*</span>
				<Tooltip text={SECTION_TOOLTIPS.sizes} />
			</h3>
			<Button size="sm" onclick={addSize}>
				+ Add Size
			</Button>
		</div>

		<div class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
			{#if sizes.length > 0}
				{#each sizes as size, sizeIndex (size.id)}
					<SizeCard
						id={size.id}
						bind:value={size.value}
						index={sizeIndex}
						{stores}
						canRemove={sizes.length > 1}
						onRemove={() => removeSize(sizeIndex)}
						onAddLink={() => addPurchaseLink(sizeIndex)}
						onRemoveLink={(linkIndex) => removePurchaseLink(sizeIndex, linkIndex)}
					/>
				{/each}
			{:else}
				<div class="flex flex-col items-center justify-center h-full text-center p-4">
					<CubeIcon class="h-12 w-12 text-muted-foreground mb-3" />
					<p class="text-sm text-muted-foreground">No sizes added yet. Click "Add Size" to add spool configurations.</p>
				</div>
			{/if}
		</div>
	{/snippet}
</SchemaForm>
{/if}
