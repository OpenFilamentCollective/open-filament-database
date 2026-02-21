<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Filament, Variant } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard, SlicerSettingsDisplay, CertificationsDisplay, ChildListPanel } from '$lib/components/entity';
	import { FilamentForm, VariantForm } from '$lib/components/forms';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filament: Filament | null = $state(null);
	let originalFilament: Filament | null = $state(null);
	let variants: Variant[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let createError: string | null = $state(null);

	let displayVariants = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		parentPath: `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
		namespace: 'variants',
		items: variants,
		getKeys: (v) => [v.id, v.slug],
		buildStub: (id, stubName) => ({
			id,
			slug: id,
			filament_id: filamentId,
			name: stubName,
			color_hex: '#808080',
			discontinued: false
		} as unknown as Variant)
	}));

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			filament
				? `brands/${brandId}/materials/${materialType}/filaments/${filament.id}`
				: null,
		getEntity: () => filament
	});

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
					const filamentPath = `brands/${params.brandId}/materials/${params.materialType}/filaments/${params.filamentId}`;
					const change = $changes.get(filamentPath);
					if ($useChangeTracking && change?.operation === 'delete') {
						error = 'This filament has been deleted in your local changes. Export your changes to finalize the deletion.';
					} else {
						error = 'Filament not found';
					}
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
			const existingId = filament.slug || filament.id;
			const updatedFilament = {
				...filament,
				...data,
				id: existingId,
				slug: existingId
			} as Filament;

			const success = await db.saveFilament(
				brandId,
				materialType,
				existingId,
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
					goto(`/brands/${brandId}/${materialType}`);
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

	function openCreateVariantModal() {
		createError = null;
		entityState.openCreate();
	}

	async function handleCreateVariant(data: any) {
		entityState.creating = true;
		createError = null;

		try {
			// Check for duplicate variant
			const variantSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			const duplicate = variants.find((v) => (v.slug ?? v.id).toLowerCase() === variantSlug);
			if (duplicate) {
				createError = `Variant "${data.name}" already exists in this filament`;
				entityState.creating = false;
				return;
			}

			const result = await db.createVariant(brandId, materialType, filamentId, data);

			if (result.success && result.variantSlug) {
				messageHandler.showSuccess('Variant created successfully!');
				entityState.closeCreate();
				goto(`/brands/${brandId}/${materialType}/${filamentId}/${result.variantSlug}`);
			} else {
				createError = 'Failed to create variant';
			}
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create variant';
		} finally {
			entityState.creating = false;
		}
	}
</script>

{#snippet certificationsRender(certifications: string[])}
	<CertificationsDisplay {certifications} />
{/snippet}

{#snippet slicerSettingsRender(settings: Record<string, any>)}
	<SlicerSettingsDisplay {settings} />
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
				<p class="text-muted-foreground">ID: {filamentData.slug || filamentData.id}</p>
				{#if $useChangeTracking && !entityState.isLocalCreate && filamentData.slug && filamentData.slug !== filamentData.id}
					<p class="text-muted-foreground">UUID: {filamentData.id}</p>
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

				<ChildListPanel
					title="Variants"
					addLabel="Add Variant"
					onAdd={openCreateVariantModal}
					itemCount={displayVariants.length}
					emptyMessage="No variants found for this filament."
				>
					{#each displayVariants as variant}
						{@const variantPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variant.slug}`}
						{@const changeProps = getChildChangeProps($changes, $useChangeTracking, variantPath)}
						{@const sizesCount = variant.sizes?.length ?? 0}
						{@const sizesInfo = sizesCount > 0 ? `${sizesCount} size${sizesCount !== 1 ? 's' : ''}` : undefined}
						<EntityCard
							entity={variant}
							name={variant.name}
							id={variant.slug}
							href="/brands/{brandId}/{materialType}/{filamentId}/{variant.slug}"
							colorHex={variant.color_hex}
							hoverColor="orange"
							showLogo={false}
							badge={variant.discontinued ? { text: 'Discontinued', color: 'red' } : undefined}
							secondaryInfo={sizesInfo}
							hasLocalChanges={changeProps.hasLocalChanges}
							localChangeType={changeProps.localChangeType}
						/>
					{/each}
				</ChildListPanel>
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

<Modal show={entityState.showCreateModal} title="Create New Variant" onClose={() => { createError = null; entityState.closeCreate(); }} maxWidth="5xl" height="3/4">
	{#if createError}
		<MessageBanner type="error" message={createError} />
	{/if}
	<VariantForm onSubmit={handleCreateVariant} saving={entityState.creating} />
</Modal>
