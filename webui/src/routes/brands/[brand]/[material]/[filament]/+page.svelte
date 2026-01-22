<script lang="ts">
	import { page } from '$app/stores';
	import type { Filament, Variant } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard } from '$lib/components/entity';
	import { FilamentForm, VariantForm } from '$lib/components/forms';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, mergeEntityData } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filament: Filament | null = $state(null);
	let originalFilament: Filament | null = $state(null);
	let variants: Variant[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			filament
				? `brands/${brandId}/materials/${materialType}/filaments/${filament.id}`
				: null,
		getEntity: () => filament
	});

	const SLICER_LABELS: Record<string, string> = {
		prusaslicer: 'PrusaSlicer',
		bambustudio: 'Bambu Studio',
		orcaslicer: 'Orca Slicer',
		cura: 'Cura',
		generic: 'Generic'
	};

	// Load data when route parameters change
	$effect(() => {
		const params = { brandId, materialType, filamentId };

		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
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
				originalFilament = structuredClone(filamentData);
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

		entityState.saving = true;
		messageHandler.clear();

		try {
			const updatedFilament = mergeEntityData(filament, data, ['id', 'slug']) as Filament;

			const success = await db.saveFilament(
				brandId,
				materialType,
				filamentId,
				updatedFilament,
				originalFilament ?? filament
			);

			if (success) {
				filament = updatedFilament;
				messageHandler.showSuccess('Filament saved successfully!');
				entityState.closeEdit();
			} else {
				messageHandler.showError('Failed to save filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save filament');
		} finally {
			entityState.saving = false;
		}
	}

	async function handleDelete() {
		if (!filament) return;

		entityState.deleting = true;
		messageHandler.clear();

		try {
			const result = await deleteEntity(
				`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
				'Filament',
				() => db.deleteFilament(brandId, materialType, filamentId, filament!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				setTimeout(() => {
					window.location.href = `/brands/${brandId}/${materialType}`;
				}, 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete filament');
			entityState.deleting = false;
		}
	}

	async function handleCreateVariant(data: any) {
		entityState.creating = true;
		messageHandler.clear();

		try {
			const result = await db.createVariant(brandId, materialType, filamentId, data);

			if (result.success && result.variantSlug) {
				messageHandler.showSuccess('Variant created successfully!');
				entityState.closeCreate();
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create variant');
		} finally {
			entityState.creating = false;
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
				{#if $isCloudMode}
					{#if filamentData.slug}
						<p class="text-muted-foreground">Native ID: {filamentData.slug}</p>
						<p class="text-muted-foreground">Cloud ID: {filamentData.id}</p>
					{:else}
						<p class="text-muted-foreground">Native ID: {filamentData.id}</p>
					{/if}
				{:else}
					<p class="text-muted-foreground">ID: {filamentData.id}</p>
				{/if}
			</header>

			{#if entityState.hasLocalChanges}
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
						<ActionButtons onEdit={entityState.openEdit} onDelete={entityState.openDelete} />
					{/snippet}
				</EntityDetails>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Variants</h2>
						<button
							onclick={entityState.openCreate}
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

<Modal show={entityState.showEditModal} title="Edit Filament" onClose={entityState.closeEdit} maxWidth="5xl">
	{#if filament}
		<div class="h-[70vh]">
			<FilamentForm {filament} onSubmit={handleSubmit} saving={entityState.saving} />
		</div>
	{/if}
</Modal>

<DeleteConfirmationModal
	show={entityState.showDeleteModal}
	title="Delete Filament"
	entityName={filament?.name ?? ''}
	isLocalCreate={entityState.isLocalCreate}
	deleting={entityState.deleting}
	onClose={entityState.closeDelete}
	onDelete={handleDelete}
	cascadeWarning="This will also delete all variants within this filament."
/>

<Modal show={entityState.showCreateModal} title="Create New Variant" onClose={entityState.closeCreate} maxWidth="5xl" height="3/4">
	<VariantForm onSubmit={handleCreateVariant} saving={entityState.creating} />
</Modal>
