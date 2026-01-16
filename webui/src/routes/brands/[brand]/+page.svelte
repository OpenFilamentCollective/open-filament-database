<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Brand, Material } from '$lib/types/database';
	import Logo from '$lib/components/Logo.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import BrandForm from '$lib/components/forms/BrandForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import DataDisplay from '$lib/components/DataDisplay.svelte';
	import EntityDetails from '$lib/components/EntityDetails.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { saveLogoImage, deleteLogoImage } from '$lib/utils/logoManagement';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { changeStore } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';

	let brandId: string = $derived($page.params.brand!);
	let brand: Brand | null = $state(null);
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);
	let deleting: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Check if this brand has local changes
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !brand) return false;

		const entityPath = `brands/${brandId}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
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

			// Use DatabaseService for saving (handles cloud vs local mode)
			const success = await db.saveBrand(updatedBrand, brand);

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
		<BackButton href="/brands" label="Brand" />
	</div>

	<DataDisplay {loading} {error} data={brand}>
		{#snippet children(brandData)}
			<header class="mb-6 flex items-center gap-4">
				<Logo src={brandData.logo} alt={brandData.name} type="brand" id={brandData.id} size="lg" />
				<div>
					<h1 class="text-3xl font-bold mb-2">{brandData.name}</h1>
					<p class="text-gray-600">Brand ID: {brandData.id}</p>
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
						<div class="flex gap-2">
							<button
								onclick={openEditModal}
								class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
							>
								Edit
							</button>
							<button
								onclick={openDeleteModal}
								class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
							>
								Delete
							</button>
						</div>
					{/snippet}
				</EntityDetails>

				<div class="bg-white border border-gray-200 rounded-lg p-6">
					<h2 class="text-xl font-semibold mb-4">Materials</h2>

					{#if materials.length === 0}
						<p class="text-gray-500">No materials found for this brand.</p>
					{:else}
						<div class="space-y-2">
							{#each materials as material}
								{@const materialHref = `/brands/${brandData.slug ?? brandData.id}/${material.materialType ?? material.material.toLowerCase()}`}
								<EntityCard
									entity={material}
									href={materialHref}
									name={material.material}
									id={material.materialType ?? material.material}
									hoverColor="purple"
									showLogo={false}
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
			<p class="text-gray-700">
				Are you sure you want to delete the brand <strong>{brand.name}</strong>?
			</p>

			{#if $isCloudMode}
				<div class="bg-blue-50 border border-blue-200 rounded p-3">
					<p class="text-sm text-blue-800">
						{#if $changeStore.changes[`brands/${brandId}`]?.operation === 'create'}
							This will remove the locally created brand. The change will be discarded.
						{:else}
							This will mark the brand for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-red-50 border border-red-200 rounded p-3">
					<p class="text-sm text-red-800">
						This action cannot be undone. The brand will be permanently deleted from the filesystem.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<button
					onclick={closeDeleteModal}
					disabled={deleting}
					class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={handleDelete}
					disabled={deleting}
					class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Delete Brand'}
				</button>
			</div>
		</div>
	{/if}
</Modal>
