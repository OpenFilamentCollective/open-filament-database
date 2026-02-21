<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Brand, Material } from '$lib/types/database';
	import { Modal, MessageBanner, ActionButtons, DeleteConfirmationModal } from '$lib/components/ui';
	import { BrandForm, MaterialForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { Logo, EntityDetails, EntityCard, ChildListPanel } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { db } from '$lib/services/database';
	import { deleteEntity, generateMaterialType, generateSlug } from '$lib/services/entityService';
	import { apiFetch } from '$lib/utils/api';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { changes } from '$lib/stores/changes';
	import { useChangeTracking } from '$lib/stores/environment';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';

	let brandId: string = $derived($page.params.brand!);
	let brand: Brand | null = $state(null);
	let originalBrand: Brand | null = $state(null); // Keep original for revert detection
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let materialSchema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	let showCreateMaterialModal: boolean = $state(false);
	let creatingMaterial: boolean = $state(false);
	let createMaterialError: string | null = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => brand ? `brands/${brandId}` : null,
		getEntity: () => brand
	});

	let displayMaterials = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		parentPath: `brands/${brandId}`,
		namespace: 'materials',
		items: materials,
		getKeys: (m) => [m.id, m.materialType, m.material?.toLowerCase()],
		buildStub: (id, name) => ({ id, materialType: id, material: name } as unknown as Material)
	}));

	onMount(async () => {
		try {
			// Use DatabaseService for brand and materials to apply pending changes
			const [brandData, materialsData, schemaData, matSchemaData] = await Promise.all([
				db.getBrand(brandId),
				db.loadMaterials(brandId),
				apiFetch('/api/schemas/brand').then((r) => r.json()),
				fetchEntitySchema('material')
			]);

			if (!brandData) {
				const brandPath = `brands/${brandId}`;
				const change = $changes.get(brandPath);
				if ($useChangeTracking && change?.operation === 'delete') {
					error = 'This brand has been deleted in your local changes. Export your changes to finalize the deletion.';
				} else {
					error = 'Brand not found';
				}
				loading = false;
				return;
			}

			brand = brandData;
			originalBrand = structuredClone(brandData); // Deep clone for revert detection
			materials = materialsData;
			schema = schemaData;
			materialSchema = matSchemaData;

		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load brand';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!brand) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
			// If logo was changed, store the new logo in the change store
			let logoFilename = brand.logo;
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(brand.id, entityState.logoDataUrl, 'brand');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.saving = false;
					return;
				}
				logoFilename = savedPath;
			}

			// For locally created brands, regenerate id/slug from name so it stays in sync
			// For existing brands, preserve both id (UUID) and slug
			const newSlug = entityState.isLocalCreate ? generateSlug(data.name) : (brand.slug || brandId);
			const newId = entityState.isLocalCreate ? newSlug : brand.id;
			const updatedBrand = {
				...data,
				id: newId,
				slug: newSlug,
				logo: logoFilename
			};

			const success = await db.saveBrand(updatedBrand, originalBrand ?? brand);

			if (success) {
				brand = updatedBrand;
				entityState.resetLogo();
				messageHandler.showSuccess('Brand saved successfully!');
				entityState.closeEdit();

				// If slug changed (only for local creates when name changes), redirect
				if (newSlug !== brandId) {
					setTimeout(() => {
						window.location.href = `/brands/${newSlug}`;
					}, 500);
				}
			} else {
				messageHandler.showError('Failed to save brand');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save brand');
		} finally {
			entityState.saving = false;
		}
	}

	function openCreateMaterialModal() {
		createMaterialError = null;
		showCreateMaterialModal = true;
	}

	function closeCreateMaterialModal() {
		createMaterialError = null;
		showCreateMaterialModal = false;
	}

	async function handleCreateMaterial(data: any) {
		if (!brand) return;

		creatingMaterial = true;
		createMaterialError = null;

		try {
			// Check for duplicate material
			const newMaterialType = generateMaterialType(data.material);
			const duplicate = materials.find(
				(m) => (m.materialType || m.material || '').toLowerCase() === newMaterialType.toLowerCase()
			);
			if (duplicate) {
				createMaterialError = `Material "${data.material}" already exists in this brand`;
				creatingMaterial = false;
				return;
			}

			const result = await db.createMaterial(brandId, data);

			if (result.success && result.materialType) {
				messageHandler.showSuccess('Material created successfully!');
				showCreateMaterialModal = false;

				setTimeout(() => {
					window.location.href = `/brands/${brandId}/${result.materialType!}`;
				}, 500);
			} else {
				createMaterialError = 'Failed to create material';
			}
		} catch (e) {
			createMaterialError = e instanceof Error ? e.message : 'Failed to create material';
		} finally {
			creatingMaterial = false;
		}
	}

	async function handleDelete() {
		if (!brand) return;

		entityState.deleting = true;
		messageHandler.clear();

		try {
			const result = await deleteEntity(
				`brands/${brandId}`,
				'Brand',
				() => db.deleteBrand(brandId, brand!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				setTimeout(() => {
					window.location.href = '/brands';
				}, 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete brand');
			entityState.deleting = false;
		}
	}
</script>

<svelte:head>
	<title>{brand ? `${brand.name}` : 'Brand Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<div class="mb-6">
		<BackButton href="/brands" label="Brands" />
	</div>

	<DataDisplay {loading} {error} data={brand}>
		{#snippet children(brandData)}
			<header class="mb-6 flex items-center gap-4">
				<Logo src={brandData.logo} alt={brandData.name} type="brand" id={brandData.id} size="lg" />
				<div>
					<h1 class="text-3xl font-bold mb-2">{brandData.name}</h1>
					<p class="text-muted-foreground">ID: {brandData.slug || brandData.id}</p>
					{#if $useChangeTracking && !entityState.isLocalCreate && brandData.slug && brandData.slug !== brandData.id}
						<p class="text-muted-foreground">UUID: {brandData.id}</p>
					{/if}
				</div>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityDetails
					entity={brandData}
					title="Brand Details"
					fields={[
						{ key: 'name' },
						{ key: 'website', type: 'link' },
						{ key: 'origin' },
						{ key: 'logo', type: 'logo', logoType: 'brand', logoEntityId: brandData.slug ?? brandData.id }
					]}
				>
					{#snippet actions()}
						<ActionButtons onEdit={entityState.openEdit} onDelete={entityState.openDelete} editVariant="primary" />
					{/snippet}
				</EntityDetails>

				<ChildListPanel
					title="Materials"
					addLabel="Add Material"
					onAdd={openCreateMaterialModal}
					itemCount={displayMaterials.length}
					emptyMessage="No materials found for this brand."
				>
					{#each displayMaterials as material}
						{@const materialHref = `/brands/${brandData.slug ?? brandData.id}/${material.materialType ?? material.material.toLowerCase()}`}
						{@const materialPath = `brands/${brandId}/materials/${material.materialType ?? material.material.toLowerCase()}`}
						{@const changeProps = getChildChangeProps($changes, $useChangeTracking, materialPath)}
						<EntityCard
							entity={material}
							href={materialHref}
							name={material.material}
							id={material.materialType ?? material.material}
							hoverColor="purple"
							showLogo={false}
							hasLocalChanges={changeProps.hasLocalChanges}
							localChangeType={changeProps.localChangeType}
						/>
					{/each}
				</ChildListPanel>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showEditModal} title="Edit Brand" onClose={entityState.closeEdit} maxWidth="3xl">
	{#if brand && schema}
		<BrandForm
			{brand}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.saving}
		/>
	{/if}
</Modal>

<DeleteConfirmationModal
	show={entityState.showDeleteModal}
	title="Delete Brand"
	entityName={brand?.name ?? ''}
	isLocalCreate={entityState.isLocalCreate}
	deleting={entityState.deleting}
	onClose={entityState.closeDelete}
	onDelete={handleDelete}
	cascadeWarning="This will also delete all materials, filaments, and variants within this brand."
/>

<Modal show={showCreateMaterialModal} title="Create New Material" onClose={closeCreateMaterialModal} maxWidth="5xl" height="3/4">
	{#if createMaterialError}
		<MessageBanner type="error" message={createMaterialError} />
	{/if}
	{#if materialSchema}
		<MaterialForm
			schema={materialSchema}
			config={{ excludeEnumValues: { material: materials.map(m => m.material) } }}
			onSubmit={handleCreateMaterial}
			saving={creatingMaterial}
		/>
	{/if}
</Modal>
