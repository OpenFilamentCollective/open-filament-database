<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Brand, Material } from '$lib/types/database';
	import { Modal, MessageBanner, Button, ActionButtons } from '$lib/components/ui';
	import { BrandForm, MaterialForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { Logo, EntityDetails, EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { saveLogoImage, deleteLogoImage } from '$lib/utils/logoManagement';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { changeStore } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';

	let brandId: string = $derived($page.params.brand!);
	let brand: Brand | null = $state(null);
	let originalBrand: Brand | null = $state(null); // Keep original for revert detection
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let showCreateMaterialModal: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);
	let deleting: boolean = $state(false);
	let creatingMaterial: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Check if this brand has local changes (use brand.id which is the UUID, not the URL slug)
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !brand) return false;

		const entityPath = `brands/${brand.id}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
	});

	// Check if this brand was locally created
	let isLocalCreate = $derived.by(() => {
		if (!$isCloudMode || !brand) return false;
		const entityPath = `brands/${brand.id}`;
		return $changeStore.changes[entityPath]?.operation === 'create';
	});

	onMount(async () => {
		try {
			// Use DatabaseService for brand and materials to apply pending changes
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
			originalBrand = structuredClone(brandData); // Deep clone for revert detection
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

		saving = true;
		messageHandler.clear();

		try {
			// If logo was changed, save the new logo and delete the old one
			let logoFilename = brand.logo;
			if (logoChanged && logoDataUrl) {
				// Delete old logo first
				if (brand.logo) {
					await deleteLogoImage(brand.id, brand.logo, 'brand');
				}

				// Upload new logo
				const savedPath = await saveLogoImage(brand.id, logoDataUrl, 'brand');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					saving = false;
					return;
				}
				// In cloud mode, savedPath is the imageId for change store lookup
				// In local mode, savedPath is the filename
				logoFilename = savedPath;
			}

			// Update brand data with new logo filename (or keep existing if not changed)
			// Preserve id and slug from original brand since form doesn't include them
			const updatedBrand = {
				...data,
				id: brand.id,
				slug: brand.slug ?? brand.id,
				logo: logoFilename
			};

			// Pass the original brand data so change tracking can detect reverts
			const success = await db.saveBrand(updatedBrand, originalBrand ?? brand);

			if (success) {
				brand = updatedBrand;
				logoChanged = false;
				logoDataUrl = '';
				messageHandler.showSuccess('Brand saved successfully!');
				showEditModal = false;
			} else {
				messageHandler.showError('Failed to save brand');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save brand');
		} finally {
			saving = false;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	function openCreateMaterialModal() {
		showCreateMaterialModal = true;
	}

	function closeCreateMaterialModal() {
		showCreateMaterialModal = false;
	}

	async function handleCreateMaterial(data: any) {
		if (!brand) return;

		creatingMaterial = true;
		messageHandler.clear();

		try {
			const result = await db.createMaterial(brandId, data);

			if (result.success && result.materialType) {
				messageHandler.showSuccess('Material created successfully!');
				showCreateMaterialModal = false;

				// Reload the page to show the new material
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create material');
		} finally {
			creatingMaterial = false;
		}
	}

	async function handleDelete() {
		if (!brand) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				// In cloud mode, check if this is a newly created brand
				const entityPath = `brands/${brandId}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					// If it was created locally, just remove the change
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local brand creation removed');
				} else {
					// Otherwise, track as a delete or remove existing update changes
					await db.deleteBrand(brand.id, brand);
					messageHandler.showSuccess('Brand marked for deletion - export to save');
				}
			} else {
				// In local mode, delete from filesystem
				const success = await db.deleteBrand(brand.id, brand);
				if (success) {
					messageHandler.showSuccess('Brand deleted successfully');
				} else {
					messageHandler.showError('Failed to delete brand');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			// Navigate back to brands list after successful delete
			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = '/brands';
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete brand');
			deleting = false;
			showDeleteModal = false;
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
							{#if !isLocalCreate}
								<p class="text-muted-foreground">Cloud ID: {brandData.id}</p>
							{/if}
						{:else}
							<p class="text-muted-foreground">Native ID: {brandData.id}</p>
						{/if}
					{:else}
						<p class="text-muted-foreground">ID: {brandData.id}</p>
					{/if}
				</div>
			</header>

			{#if hasLocalChanges}
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
						<ActionButtons onEdit={openEditModal} onDelete={openDeleteModal} editVariant="primary" />
					{/snippet}
				</EntityDetails>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Materials</h2>
						<Button onclick={openCreateMaterialModal} variant="secondary" size="sm">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
							</svg>
							Add Material
						</Button>
					</div>

					{#if materials.length === 0}
						<p class="text-muted-foreground">No materials found for this brand.</p>
					{:else}
						<div class="space-y-2">
							{#each materials as material}
								{@const materialHref = `/brands/${brandData.slug ?? brandData.id}/${material.materialType ?? material.material.toLowerCase()}`}
								{@const materialPath = `brands/${brandData.id}/materials/${material.materialType ?? material.material.toLowerCase()}`}
								{@const materialChange = $isCloudMode ? $changeStore.changes[materialPath] : undefined}
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

<Modal show={showEditModal} title="Edit Brand" onClose={closeEditModal} maxWidth="3xl">
	{#if brand && schema}
		<BrandForm
			{brand}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={handleLogoChange}
			{logoChanged}
			{saving}
		/>
	{/if}
</Modal>

<Modal show={showDeleteModal} title="Delete Brand" onClose={closeDeleteModal} maxWidth="md">
	{#if brand}
		<div class="space-y-4">
			<p class="text-foreground">
				Are you sure you want to delete the brand <strong>{brand.name}</strong>?
			</p>

			{#if $isCloudMode}
				<div class="bg-primary/10 border border-primary/20 rounded p-3">
					<p class="text-sm text-primary">
						{#if $changeStore.changes[`brands/${brandId}`]?.operation === 'create'}
							This will remove the locally created brand. The change will be discarded.
						{:else}
							This will mark the brand for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
					<p class="text-sm text-destructive">
						This action cannot be undone. The brand will be permanently deleted from the filesystem.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<Button onclick={closeDeleteModal} disabled={deleting} variant="secondary">
					Cancel
				</Button>
				<Button onclick={handleDelete} disabled={deleting} variant="destructive">
					{deleting ? 'Deleting...' : 'Delete Brand'}
				</Button>
			</div>
		</div>
	{/if}
</Modal>

<Modal show={showCreateMaterialModal} title="Create New Material" onClose={closeCreateMaterialModal} maxWidth="5xl" height="3/4">
	<MaterialForm
		onSubmit={handleCreateMaterial}
		saving={creatingMaterial}
	/>
</Modal>
