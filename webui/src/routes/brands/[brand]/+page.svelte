<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Brand, Material } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { BrandForm, MaterialForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { Logo, EntityDetails, EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, mergeEntityData } from '$lib/services/entityService';
	import { saveLogoImage, deleteLogoImage } from '$lib/utils/logoManagement';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { changeStore } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';

	let brandId: string = $derived($page.params.brand!);
	let brand: Brand | null = $state(null);
	let originalBrand: Brand | null = $state(null);
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	const messageHandler = createMessageHandler();

	// Unified entity state management
	const entityState = createEntityState({
		getEntityPath: () => (brand ? `brands/${brand.id}` : null),
		getEntity: () => brand
	});

	onMount(async () => {
		try {
			const [brandData, materialsData, schemaData] = await Promise.all([
				db.getBrand(brandId),
				db.loadMaterials(brandId),
				apiFetch('/api/schemas/brand').then((r) => r.json())
			]);

			if (!brandData) {
				error = 'Brand not found';
				loading = false;
				return;
			}

			brand = brandData;
			originalBrand = structuredClone(brandData);
			materials = materialsData;
			schema = schemaData;
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
			let logoFilename = brand.logo;
			if (entityState.logoChanged && entityState.logoDataUrl) {
				if (brand.logo) {
					await deleteLogoImage(brand.id, brand.logo, 'brand');
				}
				const savedPath = await saveLogoImage(brand.id, entityState.logoDataUrl, 'brand');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.saving = false;
					return;
				}
				logoFilename = savedPath;
			}

			const updatedBrand = mergeEntityData(brand, { ...data, logo: logoFilename }, [
				'id',
				'slug'
			]) as Brand;

			const success = await db.saveBrand(updatedBrand, originalBrand ?? brand);

			if (success) {
				brand = updatedBrand;
				entityState.resetLogo();
				messageHandler.showSuccess('Brand saved successfully!');
				entityState.closeEdit();
			} else {
				messageHandler.showError('Failed to save brand');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save brand');
		} finally {
			entityState.saving = false;
		}
	}

	async function handleDelete() {
		if (!brand) return;

		entityState.deleting = true;
		messageHandler.clear();

		try {
			const result = await deleteEntity(`brands/${brand.id}`, 'Brand', () =>
				db.deleteBrand(brand!.id, brand!)
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

	async function handleCreateMaterial(data: any) {
		if (!brand) return;

		entityState.creating = true;
		messageHandler.clear();

		try {
			const result = await db.createMaterial(brandId, data);

			if (result.success && result.materialType) {
				messageHandler.showSuccess('Material created successfully!');
				entityState.closeCreate();
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create material');
		} finally {
			entityState.creating = false;
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
					{#if $isCloudMode}
						{#if brandData.slug}
							<p class="text-muted-foreground">Native ID: {brandData.slug}</p>
							<p class="text-muted-foreground">Cloud ID: {brandData.id}</p>
						{:else}
							<p class="text-muted-foreground">Native ID: {brandData.id}</p>
						{/if}
					{:else}
						<p class="text-muted-foreground">ID: {brandData.id}</p>
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
						{
							key: 'logo',
							type: 'logo',
							logoType: 'brand',
							logoEntityId: brandData.slug ?? brandData.id
						}
					]}
				>
					{#snippet actions()}
						<ActionButtons
							onEdit={entityState.openEdit}
							onDelete={entityState.openDelete}
							editVariant="primary"
						/>
					{/snippet}
				</EntityDetails>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Materials</h2>
						<button
							onclick={entityState.openCreate}
							class="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-1"
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
							Add Material
						</button>
					</div>

					{#if materials.length === 0}
						<p class="text-muted-foreground">No materials found for this brand.</p>
					{:else}
						<div class="space-y-2">
							{#each materials as material}
								{@const materialHref = `/brands/${brandData.slug ?? brandData.id}/${material.materialType ?? material.material.toLowerCase()}`}
								{@const materialPath = `brands/${brandData.id}/materials/${material.materialType ?? material.material.toLowerCase()}`}
								{@const materialChange = $isCloudMode
									? $changeStore.changes[materialPath]
									: undefined}
								<EntityCard
									entity={material}
									href={materialHref}
									name={material.material}
									id={material.materialType ?? material.material}
									hoverColor="purple"
									showLogo={false}
									hasLocalChanges={!!materialChange}
									localChangeType={materialChange?.operation}
								/>
							{/each}
						</div>
					{/if}
				</div>
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
/>

<Modal
	show={entityState.showCreateModal}
	title="Create New Material"
	onClose={entityState.closeCreate}
	maxWidth="5xl"
	height="3/4"
>
	<MaterialForm onSubmit={handleCreateMaterial} saving={entityState.creating} />
</Modal>
