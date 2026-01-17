<script lang="ts">
	import { page } from '$app/stores';
	import type { Filament, Variant } from '$lib/types/database';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard } from '$lib/components/entity';
	import { FilamentForm, VariantForm } from '$lib/components/forms';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filament: Filament | null = $state(null);
	let originalFilament: Filament | null = $state(null); // Keep original for revert detection
	let variants: Variant[] = $state([]);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let showCreateVariantModal: boolean = $state(false);
	let deleting: boolean = $state(false);
	let creatingVariant: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	const SLICER_LABELS: Record<string, string> = {
		prusaslicer: 'PrusaSlicer',
		bambustudio: 'Bambu Studio',
		orcaslicer: 'Orca Slicer',
		cura: 'Cura',
		generic: 'Generic'
	};

	// Check if this filament has local changes
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !filament) return false;

		// Use filament.id for the entity path (not URL slug)
		const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filament.id}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
	});

	// Load data when route parameters change
	$effect(() => {
		// Track all route parameters to reload when any change
		const params = { brandId, materialType, filamentId };

		loading = true;
		error = null;
		showEditModal = false; // Close edit modal when navigating

		(async () => {
			try {
				// Use DatabaseService for filament and variants to apply pending changes
				const [filamentData, variantsData] = await Promise.all([
					db.getFilament(params.brandId, params.materialType, params.filamentId),
					db.loadVariants(params.brandId, params.materialType, params.filamentId)
				]);

				if (!filamentData) {
					error = 'Filament not found';
					loading = false;
					return;
				}

				filament = filamentData;
				originalFilament = structuredClone(filamentData); // Deep clone for revert detection
				variants = variantsData || [];
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load filament';
			} finally {
				loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!filament) return;

		saving = true;
		messageHandler.clear();

		try {
			// Merge with original filament to preserve fields not in the form (like material_id, material)
			// Form data takes precedence for fields it manages
			const updatedFilament = {
				...filament,
				...data,
				id: filament.id,
				slug: filament.slug ?? filament.id
			};

			// Pass the original filament data so change tracking can detect reverts
			const success = await db.saveFilament(brandId, materialType, filamentId, updatedFilament, originalFilament ?? filament);

			if (success) {
				filament = updatedFilament;
				messageHandler.showSuccess('Filament saved successfully!');
				showEditModal = false;
			} else {
				messageHandler.showError('Failed to save filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save filament');
		} finally {
			saving = false;
		}
	}

	function openEditModal() {
		if (filament) {
			showEditModal = true;
		}
	}

	function closeEditModal() {
		showEditModal = false;
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!filament) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local filament creation removed');
				} else {
					await db.deleteFilament(brandId, materialType, filamentId, filament);
					messageHandler.showSuccess('Filament marked for deletion - export to save');
				}
			} else {
				const success = await db.deleteFilament(brandId, materialType, filamentId, filament);
				if (success) {
					messageHandler.showSuccess('Filament deleted successfully');
				} else {
					messageHandler.showError('Failed to delete filament');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = `/brands/${brandId}/${materialType}`;
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete filament');
			deleting = false;
			showDeleteModal = false;
		}
	}

	function openCreateVariantModal() {
		showCreateVariantModal = true;
	}

	function closeCreateVariantModal() {
		showCreateVariantModal = false;
	}

	async function handleCreateVariant(data: any) {
		creatingVariant = true;
		messageHandler.clear();

		try {
			const result = await db.createVariant(brandId, materialType, filamentId, data);

			if (result.success && result.variantSlug) {
				messageHandler.showSuccess('Variant created successfully!');
				showCreateVariantModal = false;

				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create variant');
		} finally {
			creatingVariant = false;
		}
	}
</script>

{#snippet certificationsRender(certifications: string[])}
	<div class="flex flex-wrap gap-2">
		{#each certifications as cert}
			<span class="px-2 py-1 bg-primary/10 text-primary rounded text-sm">{cert}</span>
		{/each}
	</div>
{/snippet}

{#snippet slicerSettingsRender(settings: Record<string, any>)}
	<div class="space-y-2">
		{#each Object.entries(settings) as [slicerKey, slicerSettings]}
			<div class="bg-muted/50 rounded p-2">
				<div class="font-medium text-sm">{SLICER_LABELS[slicerKey] || slicerKey}</div>
				<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
					{#each Object.entries(slicerSettings as Record<string, any>) as [key, value]}
						{#if value !== undefined && value !== null && value !== ''}
							<div><span class="font-medium">{key}:</span> {typeof value === 'object' ? JSON.stringify(value) : value}</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
{/snippet}

<svelte:head>
	<title>{filament ? `${filament.name}` : 'Filament Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<div class="mb-6">
		<BackButton href="/brands/{brandId}/{materialType}" label="Material" />
	</div>

	<DataDisplay {loading} {error} data={filament}>
		{#snippet children(filamentData)}
			<header class="mb-6">
				<div class="flex items-center gap-3 mb-2">
					<h1 class="text-3xl font-bold">{filamentData.name}</h1>
					{#if filamentData.discontinued}
						<span class="px-3 py-1 text-sm bg-destructive/10 text-destructive rounded-full"
							>Discontinued</span
						>
					{/if}
				</div>
				<p class="text-muted-foreground">Filament ID: {filamentData.id}</p>
			</header>

			{#if hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityDetails
					entity={filamentData}
					title="Filament Details"
					grid={true}
					fields={[
						{ key: 'name', label: 'Name', fullWidth: true },
						{ key: 'density', label: 'Density', format: (v) => `${v} g/cm³` },
						{ key: 'diameter_tolerance', label: 'Diameter Tolerance', format: (v) => `${v} mm` },
						{
							key: 'min_print_temperature',
							label: 'Print Temperature Range',
							format: (v) => `${v}°C - ${filamentData.max_print_temperature}°C`,
							hide: (v) => !v
						},
						{
							key: 'min_bed_temperature',
							label: 'Bed Temperature Range',
							format: (v) => `${v}°C - ${filamentData.max_bed_temperature}°C`,
							hide: (v) => !v
						},
						{
							key: 'preheat_temperature',
							label: 'Preheat Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						},
						{
							key: 'max_dry_temperature',
							label: 'Max Dry Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						},
						{ key: 'shore_hardness_a', label: 'Shore Hardness A', hide: (v) => !v },
						{ key: 'shore_hardness_d', label: 'Shore Hardness D', hide: (v) => !v },
						{
							key: 'min_nozzle_diameter',
							label: 'Min Nozzle Diameter',
							format: (v) => `${v} mm`,
							hide: (v) => !v
						},
						{
							key: 'certifications',
							label: 'Certifications',
							hide: (v) => !v || v.length === 0,
							customRender: certificationsRender,
							fullWidth: true
						},
						{
							key: 'slicer_settings',
							label: 'Slicer Settings',
							hide: (v) => !v || Object.keys(v).length === 0,
							customRender: slicerSettingsRender,
							fullWidth: true
						},
						{
							key: 'data_sheet_url',
							label: 'Data Sheet',
							type: 'link',
							hide: (v) => !v
						},
						{
							key: 'safety_sheet_url',
							label: 'Safety Sheet',
							type: 'link',
							hide: (v) => !v
						}
					]}
				>
					{#snippet actions()}
						<div class="flex gap-2">
							<button
								onclick={openEditModal}
								class="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md font-medium"
							>
								Edit
							</button>
							<button
								onclick={openDeleteModal}
								class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium"
							>
								Delete
							</button>
						</div>
					{/snippet}
				</EntityDetails>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Variants</h2>
						<button
							onclick={openCreateVariantModal}
							class="bg-orange-500 text-white hover:bg-orange-600 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-1"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-4 w-4"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"
									clip-rule="evenodd"
								/>
							</svg>
							Add Variant
						</button>
					</div>

					{#if variants.length === 0}
						<p class="text-muted-foreground">No variants found for this filament.</p>
					{:else}
						<div class="space-y-2">
							{#each variants as variant}
								{@const variantPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variant.slug}`}
								{@const variantChange = $isCloudMode ? $changeStore.changes[variantPath] : undefined}
								{@const sizesCount = variant.sizes?.length ?? 0}
								{@const sizesInfo = sizesCount > 0 ? `${sizesCount} size${sizesCount !== 1 ? 's' : ''}` : undefined}
								<EntityCard
									entity={variant}
									name={variant.color_name}
									id={variant.slug}
									href="/brands/{brandId}/{materialType}/{filamentId}/{variant.slug}"
									colorHex={variant.color_hex}
									hoverColor="orange"
									showLogo={false}
									badge={variant.discontinued ? { text: 'Discontinued', color: 'red' } : undefined}
									secondaryInfo={sizesInfo}
									hasLocalChanges={!!variantChange}
									localChangeType={variantChange?.operation}
								/>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showDeleteModal} title="Delete Filament" onClose={closeDeleteModal} maxWidth="md">
	{#if filament}
		<div class="space-y-4">
			<p class="text-foreground">
				Are you sure you want to delete the filament <strong>{filament.name}</strong>?
			</p>
			<p class="text-muted-foreground text-sm">
				This will also delete all variants within this filament.
			</p>

			{#if $isCloudMode}
				<div class="bg-primary/10 border border-primary/20 rounded p-3">
					<p class="text-sm text-primary">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`]?.operation === 'create'}
							This will remove the locally created filament. The change will be discarded.
						{:else}
							This will mark the filament for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
					<p class="text-sm text-destructive">
						This action cannot be undone. The filament and all its variants will be permanently deleted.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<button
					onclick={closeDeleteModal}
					disabled={deleting}
					class="bg-muted text-muted-foreground hover:bg-muted/80 px-4 py-2 rounded-md font-medium disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={handleDelete}
					disabled={deleting}
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Delete Filament'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

<Modal show={showEditModal} title="Edit Filament" onClose={closeEditModal} maxWidth="5xl">
	{#if filament}
		<div class="h-[70vh]">
			<FilamentForm filament={filament} onSubmit={handleSubmit} {saving} />
		</div>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>
	{/if}
</Modal>

<Modal show={showCreateVariantModal} title="Create New Variant" onClose={closeCreateVariantModal} maxWidth="5xl" height="3/4">
	<VariantForm onSubmit={handleCreateVariant} saving={creatingVariant} />
</Modal>
