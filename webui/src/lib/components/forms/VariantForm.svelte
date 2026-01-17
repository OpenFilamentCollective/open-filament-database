<script lang="ts">
	import { onMount } from 'svelte';
	import { db } from '$lib/services/database';
	import type { Store, VariantSize, PurchaseLink } from '$lib/types/database';
	import { TextField, CheckboxField, Tooltip } from '$lib/components/form-fields';
	import { TRAIT_CATEGORIES, findTraitByKey } from '$lib/config/traitConfig';

	interface Props {
		variant?: any;
		onSubmit: (data: any) => void;
		saving?: boolean;
	}

	let { variant = null, onSubmit, saving = false }: Props = $props();

	// Stores list for purchase link dropdowns
	let stores: Store[] = $state([]);

	// Tooltip descriptions
	const TOOLTIPS: Record<string, string> = {
		color_name: "The official color name as specified by the manufacturer.",
		color_hex: "Hex color code representing this variant (e.g., #FF5733).",
		discontinued: "Mark if this color variant has been discontinued.",
		traits: "Select traits that describe this filament variant. Click to add/remove traits.",
		sizes: "Different spool sizes and configurations available for this variant.",
		filament_weight: "Net weight of the filament material in grams.",
		diameter: "Filament diameter in mm (typically 1.75 or 2.85).",
		empty_spool_weight: "Weight of the empty spool without filament (grams).",
		spool_core_diameter: "The inner diameter of the spool core (mm).",
		gtin: "Global Trade Item Number (GTIN-12 or GTIN-13).",
		article_number: "Manufacturer's internal product/article code.",
		spool_refill: "Indicates if this is a refill for a reusable spool.",
		purchase_links: "Links to purchase this size from various stores."
	};

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

	// Form data state
	let formData = $state({
		color_name: variant?.color_name || '',
		color_hex: variant?.color_hex || '',
		discontinued: variant?.discontinued || false
	});

	// Traits state - set of selected trait keys
	let selectedTraits = $state<Set<string>>(new Set(
		variant?.traits ? Object.entries(variant.traits).filter(([_, v]) => v === true).map(([k]) => k) : []
	));

	// Trait search/filter
	let traitSearch = $state('');
	let expandedCategories = $state<Set<string>>(new Set(['appearance']));

	// Dropdown state for traits
	let showTraitDropdown = $state(false);
	let traitDropdownRef = $state<HTMLDivElement | null>(null);
	let dropdownMenuRef = $state<HTMLDivElement | null>(null);
	let addButtonRef = $state<HTMLButtonElement | null>(null);
	let dropdownPosition = $state({ top: 0, right: 0 });

	// Sizes state
	let sizes = $state<SizeWithId[]>([]);
	let nextSizeId = $state(1);
	let nextLinkId = $state(1);

	// Filter traits by search
	let filteredCategories = $derived.by(() => {
		if (!traitSearch.trim()) return TRAIT_CATEGORIES;

		const search = traitSearch.toLowerCase();
		const filtered: typeof TRAIT_CATEGORIES = {};

		for (const [catKey, category] of Object.entries(TRAIT_CATEGORIES)) {
			const matchingTraits = category.traits.filter(t =>
				t.label.toLowerCase().includes(search) ||
				t.description.toLowerCase().includes(search)
			);
			if (matchingTraits.length > 0) {
				filtered[catKey] = { ...category, traits: matchingTraits };
			}
		}
		return filtered;
	});

	// Count selected traits
	let selectedTraitCount = $derived(selectedTraits.size);

	// Toggle trait selection
	function toggleTrait(key: string) {
		if (selectedTraits.has(key)) {
			selectedTraits.delete(key);
		} else {
			selectedTraits.add(key);
		}
		selectedTraits = new Set(selectedTraits); // Trigger reactivity
	}

	// Toggle category expansion
	function toggleCategory(catKey: string) {
		if (expandedCategories.has(catKey)) {
			expandedCategories.delete(catKey);
		} else {
			expandedCategories.add(catKey);
		}
		expandedCategories = new Set(expandedCategories);
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
			// Calculate position when opening
			const rect = addButtonRef.getBoundingClientRect();
			dropdownPosition = {
				top: rect.bottom + 4,
				right: window.innerWidth - rect.right
			};
		}
		showTraitDropdown = !showTraitDropdown;
		if (showTraitDropdown) {
			traitSearch = ''; // Clear search when opening
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
			// Find max link ID
			let maxLinkId = 0;
			sizes.forEach(s => {
				s.value.purchase_links.forEach(pl => {
					if (pl.id > maxLinkId) maxLinkId = pl.id;
				});
			});
			nextLinkId = maxLinkId + 1;
		} else {
			// Start with one empty size
			sizes = [{
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
			}];
			nextSizeId = 2;
		}
	}

	// Add new size
	function addSize() {
		sizes = [...sizes, {
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
		}];
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
		sizes[sizeIndex].value.purchase_links = [
			...sizes[sizeIndex].value.purchase_links,
			newLink
		];
	}

	// Remove purchase link from a size
	function removePurchaseLink(sizeIndex: number, linkIndex: number) {
		sizes[sizeIndex].value.purchase_links =
			sizes[sizeIndex].value.purchase_links.filter((_, i) => i !== linkIndex);
	}

	// Handle form submission
	function handleSubmit() {
		// Validate required fields
		if (!formData.color_name || !formData.color_hex) {
			return;
		}

		if (sizes.length === 0) {
			return;
		}

		// Check that at least one size has required fields
		const validSizes = sizes.filter(s =>
			s.value.filament_weight !== undefined &&
			s.value.diameter !== undefined
		);

		if (validSizes.length === 0) {
			return;
		}

		// Build sizes array for submission (strip internal IDs)
		const sizesData = validSizes.map(s => {
			const sizeValue: any = {
				filament_weight: s.value.filament_weight,
				diameter: s.value.diameter
			};

			// Add optional fields only if they have values
			if (s.value.empty_spool_weight) sizeValue.empty_spool_weight = s.value.empty_spool_weight;
			if (s.value.spool_core_diameter) sizeValue.spool_core_diameter = s.value.spool_core_diameter;
			if (s.value.gtin) sizeValue.gtin = s.value.gtin;
			if (s.value.article_number) sizeValue.article_number = s.value.article_number;
			// Always include boolean fields (even when false)
			sizeValue.discontinued = s.value.discontinued ?? false;
			sizeValue.spool_refill = s.value.spool_refill ?? false;

			// Add purchase links if any valid ones exist
			const validLinks = s.value.purchase_links
				.filter(pl => pl.value.store_id && pl.value.url)
				.map(pl => ({ store_id: pl.value.store_id, url: pl.value.url }));

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

		const submitData: any = {
			color_name: formData.color_name,
			color_hex: formData.color_hex,
			discontinued: formData.discontinued,
			sizes: sizesData
		};

		// Only include traits if any are selected
		if (Object.keys(traitsData).length > 0) {
			submitData.traits = traitsData;
		}

		onSubmit(submitData);
	}

	// Load stores on mount
	onMount(async () => {
		try {
			stores = await db.loadStores();
		} catch (e) {
			console.error('Failed to load stores:', e);
		}
		initializeSizes();
	});
</script>


{#snippet sizeCard(size: SizeWithId, sizeIndex: number)}
	<div class="border border-border rounded-lg p-3">
		<div class="flex justify-between items-center mb-3">
			<h4 class="font-medium text-foreground text-sm flex items-center gap-2">
				<span class="w-2 h-2 rounded-full bg-primary flex-shrink-0"></span>
				Size {sizeIndex + 1}
			</h4>
			{#if sizes.length > 1}
				<button
					type="button"
					onclick={() => removeSize(sizeIndex)}
					aria-label="Remove size {sizeIndex + 1}"
					class="text-destructive hover:text-destructive/80"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" />
					</svg>
				</button>
			{/if}
		</div>

		<!-- Weight and Diameter (required) -->
		<div class="grid grid-cols-2 gap-2 mb-2">
			<div>
				<label for="size-{size.id}-weight" class="text-xs text-muted-foreground">Weight (g) <span class="text-destructive">*</span></label>
				<input
					id="size-{size.id}-weight"
					type="number"
					bind:value={size.value.filament_weight}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
					placeholder="1000"
					required
				/>
			</div>
			<div>
				<label for="size-{size.id}-diameter" class="text-xs text-muted-foreground">Diameter (mm) <span class="text-destructive">*</span></label>
				<select
					id="size-{size.id}-diameter"
					bind:value={size.value.diameter}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
				>
					<option value={1.75}>1.75</option>
					<option value={2.85}>2.85</option>
				</select>
			</div>
		</div>

		<!-- Spool weight and core diameter (optional) -->
		<div class="grid grid-cols-2 gap-2 mb-2">
			<div>
				<label for="size-{size.id}-spool-weight" class="text-xs text-muted-foreground">Spool Weight (g)</label>
				<input
					id="size-{size.id}-spool-weight"
					type="number"
					bind:value={size.value.empty_spool_weight}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
					placeholder="250"
				/>
			</div>
			<div>
				<label for="size-{size.id}-core-diameter" class="text-xs text-muted-foreground">Core Diameter (mm)</label>
				<input
					id="size-{size.id}-core-diameter"
					type="number"
					bind:value={size.value.spool_core_diameter}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
					placeholder="100"
				/>
			</div>
		</div>

		<!-- GTIN and Article Number (optional) -->
		<div class="grid grid-cols-2 gap-2 mb-2">
			<div>
				<label for="size-{size.id}-gtin" class="text-xs text-muted-foreground">GTIN</label>
				<input
					id="size-{size.id}-gtin"
					type="text"
					bind:value={size.value.gtin}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
					placeholder="0123456789012"
				/>
			</div>
			<div>
				<label for="size-{size.id}-article" class="text-xs text-muted-foreground">Article Number</label>
				<input
					id="size-{size.id}-article"
					type="text"
					bind:value={size.value.article_number}
					class="w-full px-2 py-1 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
					placeholder="PLA-1000-BLK"
				/>
			</div>
		</div>

		<!-- Checkboxes: Discontinued and Spool Refill -->
		<div class="flex gap-4 mb-3">
			<label class="flex items-center gap-1 text-xs text-foreground">
				<input
					type="checkbox"
					bind:checked={size.value.discontinued}
					class="w-3 h-3 rounded border-border bg-background text-primary focus:ring-ring"
				/>
				Discontinued
			</label>
			<label class="flex items-center gap-1 text-xs text-foreground">
				<input
					type="checkbox"
					bind:checked={size.value.spool_refill}
					class="w-3 h-3 rounded border-border bg-background text-primary focus:ring-ring"
				/>
				Spool Refill
			</label>
		</div>

		<!-- Purchase Links Section -->
		<div class="border-t pt-2 mt-2">
			<div class="flex items-center justify-between mb-2">
				<span class="text-xs font-medium text-muted-foreground">Purchase Links</span>
				<button
					type="button"
					onclick={() => addPurchaseLink(sizeIndex)}
					aria-label="Add purchase link to size {sizeIndex + 1}"
					class="text-xs px-2 py-0.5 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80"
				>
					+ Add Link
				</button>
			</div>

			{#if size.value.purchase_links.length > 0}
				{#each size.value.purchase_links as link, linkIndex (link.id)}
					<div class="border border-border/50 rounded p-2 mb-2 bg-muted/30">
						<div class="flex justify-between items-center mb-2">
							<span class="text-xs font-medium">Link {linkIndex + 1}</span>
							<button
								type="button"
								onclick={() => removePurchaseLink(sizeIndex, linkIndex)}
								aria-label="Remove purchase link {linkIndex + 1} from size {sizeIndex + 1}"
								class="text-destructive hover:text-destructive/80 text-xs"
							>
								Remove
							</button>
						</div>

						<div class="space-y-2">
							<!-- Store dropdown -->
							<div>
								<label for="size-{size.id}-link-{link.id}-store" class="text-xs text-muted-foreground">Store <span class="text-destructive">*</span></label>
								<select
									id="size-{size.id}-link-{link.id}-store"
									bind:value={link.value.store_id}
									class="w-full px-2 py-1 text-xs bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
								>
									<option value="">Select store...</option>
									{#each stores as store}
										<option value={store.id}>{store.name}</option>
									{/each}
								</select>
							</div>

							<!-- URL -->
							<div>
								<label for="size-{size.id}-link-{link.id}-url" class="text-xs text-muted-foreground">URL <span class="text-destructive">*</span></label>
								<input
									id="size-{size.id}-link-{link.id}-url"
									type="url"
									bind:value={link.value.url}
									class="w-full px-2 py-1 text-xs bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring"
									placeholder="https://store.com/product/..."
								/>
							</div>
						</div>
					</div>
				{/each}
			{:else}
				<p class="text-xs text-muted-foreground text-center py-2">
					No purchase links added.
				</p>
			{/if}
		</div>
	</div>
{/snippet}

<svelte:window onclick={handleClickOutside} />

<div class="flex gap-6 h-full">
	<!-- Left side: Main form -->
	<div class="w-1/2 space-y-4 flex flex-col overflow-y-auto px-1">
		<!-- Color Name (required) -->
		<TextField
			bind:value={formData.color_name}
			id="color-name"
			label="Color Name"
			required
			placeholder="e.g., Galaxy Black"
			tooltip={TOOLTIPS.color_name}
		/>

		<!-- Color Hex (required) - with color picker -->
		<div class="flex flex-col">
			<label for="color-hex" class="flex items-center text-sm font-medium text-foreground mb-1">
				Color Hex <span class="text-destructive ml-1">*</span>
				<Tooltip text={TOOLTIPS.color_hex} />
			</label>
			<div class="flex gap-2">
				<input
					id="color-hex"
					type="text"
					bind:value={formData.color_hex}
					class="flex-1 px-3 py-2 bg-background text-foreground border border-border rounded-lg focus:ring-2 focus:ring-ring focus:border-ring font-mono"
					placeholder="#FF5733"
					required
				/>
				<input
					type="color"
					bind:value={formData.color_hex}
					class="w-10 h-10 cursor-pointer flex-shrink-0 rounded border border-border"
				/>
			</div>
		</div>

		<!-- Discontinued checkbox -->
		<CheckboxField
			bind:checked={formData.discontinued}
			id="discontinued"
			label="Discontinued"
			tooltip={TOOLTIPS.discontinued}
		/>

		<!-- Traits Section -->
		<div class="border-t pt-4 mt-2" bind:this={traitDropdownRef}>
			<div class="flex items-center justify-between mb-3">
				<h3 class="text-sm font-medium text-foreground flex items-center">
					Traits
					<Tooltip text={TOOLTIPS.traits} />
				</h3>
				<!-- Add Trait button -->
				<button
					type="button"
					bind:this={addButtonRef}
					onclick={(e) => toggleTraitDropdown(e)}
					aria-label="Add trait"
					aria-haspopup="listbox"
					aria-expanded={showTraitDropdown}
					class="inline-flex items-center gap-1 px-2 py-1 border border-dashed border-border text-muted-foreground rounded-full text-xs hover:border-primary hover:text-primary transition-colors"
				>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					Add
				</button>
			</div>

			<!-- Selected traits as tiles -->
			<div class="flex flex-wrap gap-1.5">
				{#each [...selectedTraits] as traitKey}
					{@const traitInfo = findTraitByKey(traitKey)}
					<button
						type="button"
						onclick={() => removeTrait(traitKey)}
						class="inline-flex items-center gap-1 px-2 py-1 bg-primary text-primary-foreground rounded-full text-xs hover:bg-primary/90 transition-colors"
						title="Click to remove: {traitInfo?.description}"
					>
						{traitInfo?.label || traitKey}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
					</button>
				{/each}
				{#if selectedTraits.size === 0}
					<span class="text-xs text-muted-foreground">No traits selected</span>
				{/if}
			</div>

			<!-- Dropdown menu (fixed position, doesn't move) -->
			{#if showTraitDropdown}
				<div
					bind:this={dropdownMenuRef}
					class="fixed w-72 bg-popover border border-border rounded-lg shadow-lg z-[100] max-h-80 overflow-hidden flex flex-col"
					style="top: {dropdownPosition.top}px; right: {dropdownPosition.right}px;"
					role="listbox"
					aria-label="Select traits"
					onkeydown={(e) => e.key === 'Escape' && (showTraitDropdown = false)}
				>
							<!-- Search input -->
							<div class="p-2 border-b border-border">
								<input
									type="text"
									bind:value={traitSearch}
									placeholder="Search traits..."
									class="w-full px-2 py-1.5 text-sm bg-background text-foreground border border-border rounded focus:ring-1 focus:ring-ring focus:border-ring"
								/>
							</div>

							<!-- Categories and traits -->
							<div class="overflow-y-auto flex-1 p-1">
								{#each Object.entries(filteredCategories) as [catKey, category]}
									{@const unselectedTraits = category.traits.filter(t => !selectedTraits.has(t.key))}
									{#if unselectedTraits.length > 0}
										<div class="mb-1">
											<button
												type="button"
												onclick={() => toggleCategory(catKey)}
												class="w-full px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground flex items-center justify-between rounded hover:bg-muted/50"
											>
												<span>{category.label}</span>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="h-3 w-3 transition-transform {expandedCategories.has(catKey) ? 'rotate-180' : ''}"
													viewBox="0 0 20 20"
													fill="currentColor"
												>
													<path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
												</svg>
											</button>
											{#if expandedCategories.has(catKey)}
												<div class="pl-2 py-1 space-y-0.5">
													{#each unselectedTraits as trait}
														<button
															type="button"
															onclick={() => addTrait(trait.key)}
															class="w-full text-left px-2 py-1 text-xs text-foreground hover:bg-primary/10 rounded flex items-center gap-2"
															title={trait.description}
														>
															<svg xmlns="http://www.w3.org/2000/svg" class="h-3 w-3 text-muted-foreground" viewBox="0 0 20 20" fill="currentColor">
																<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
															</svg>
															{trait.label}
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								{/each}

								{#if Object.keys(filteredCategories).length === 0}
									<div class="text-center py-4 text-sm text-muted-foreground">
										No traits found
									</div>
								{/if}
							</div>
						</div>
					{/if}
		</div>

		<!-- Spacer to push submit button to bottom -->
		<div class="flex-1"></div>

		<!-- Submit Button -->
		<div class="pt-4">
			<button
				type="button"
				onclick={handleSubmit}
				disabled={saving || !formData.color_name || !formData.color_hex || sizes.length === 0}
				class="w-full px-6 py-3 bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded-md font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
			>
				{saving ? 'Saving...' : variant ? 'Update Variant' : 'Create Variant'}
			</button>
		</div>
	</div>

	<!-- Right side: Sizes panel -->
	<div class="w-1/2 border-l pl-4 flex flex-col min-w-0">
		<div class="flex items-center justify-between mb-3 flex-shrink-0">
			<h3 class="text-sm font-medium text-foreground flex items-center">
				Sizes <span class="text-destructive ml-1">*</span>
				<Tooltip text={TOOLTIPS.sizes} />
			</h3>
			<button
				type="button"
				onclick={addSize}
				aria-label="Add new size configuration"
				class="text-sm px-3 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
			>
				+ Add Size
			</button>
		</div>

		<div class="flex-1 overflow-y-auto space-y-4 pr-1 min-h-0">
			{#if sizes.length > 0}
				{#each sizes as size, sizeIndex (size.id)}
					{@render sizeCard(size, sizeIndex)}
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
							d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
						/>
					</svg>
					<p class="text-sm text-muted-foreground">
						No sizes added yet. Click "Add Size" to add spool configurations.
					</p>
				</div>
			{/if}
		</div>
	</div>
</div>
