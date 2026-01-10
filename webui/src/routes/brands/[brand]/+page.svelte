<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Brand, Material } from '$lib/types/database';
	import Logo from '$lib/components/Logo.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import BrandForm from '$lib/components/forms/BrandForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import RefreshButton from '$lib/components/RefreshButton.svelte';

	let brandId: string = $derived($page.params.brand!);
	let brand: Brand | null = $state(null);
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);
	let successMessage: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);

	onMount(async () => {
		try {
			const { apiFetch } = await import('$lib/utils/api');
			const [brandData, materialsData, schemaData] = await Promise.all([
				apiFetch(`/api/brands/${brandId}`).then((r) => r.json()),
				apiFetch(`/api/brands/${brandId}/materials`).then((r) => r.json()),
				apiFetch('/api/schemas/brand').then((r) => r.json())
			]);

			if (brandData.error) {
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
		error = null;
		successMessage = null;

		try {
			// If logo was changed, save the new logo and delete the old one
			let logoFilename = brand.logo;
			if (logoChanged && logoDataUrl) {
				// Delete old logo first
				if (brand.logo) {
					await deleteLogoImage(brand.id, brand.logo);
				}

				// Upload new logo
				const savedPath = await saveLogoImage(brand.id, logoDataUrl);
				if (!savedPath) {
					error = 'Failed to save logo';
					saving = false;
					return;
				}
				// Generate new logo filename based on the uploaded file type
				logoFilename = getLogoFilename(logoDataUrl);
			}

			// Update brand data with new logo filename (or keep existing if not changed)
			const updatedBrand = {
				...data,
				logo: logoFilename
			};

			const response = await fetch(`/api/brands/${brandId}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updatedBrand)
			});

			if (response.ok) {
				brand = updatedBrand;
				logoChanged = false;
				logoDataUrl = '';
				successMessage = 'Brand saved successfully!';
				showEditModal = false;

				setTimeout(() => {
					successMessage = null;
				}, 3000);
			} else {
				error = 'Failed to save brand';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to save brand';
		} finally {
			saving = false;
		}
	}

	async function deleteLogoImage(brandId: string, logoFilename: string): Promise<void> {
		try {
			const response = await fetch('/api/brands/logo', {
				method: 'DELETE',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					brandId,
					logoFilename,
					type: 'brand'
				})
			});

			if (!response.ok) {
				console.warn('Failed to delete old logo:', logoFilename);
			}
		} catch (e) {
			console.warn('Error deleting old logo:', e);
		}
	}

	async function saveLogoImage(brandId: string, dataUrl: string): Promise<string | null> {
		try {
			const response = await fetch('/api/brands/logo', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					brandId,
					imageData: dataUrl,
					type: 'brand'
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save logo');
			}

			const result = await response.json();
			return result.path;
		} catch (e) {
			console.error('Error saving logo:', e);
			return null;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}

	function getLogoFilename(dataUrl: string): string {
		// Extract the file type from the data URL
		const match = dataUrl.match(/^data:image\/(\w+);base64,/);
		if (match) {
			const extension = match[1];
			return `logo.${extension}`;
		}
		return 'logo.png'; // Default fallback
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}
</script>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<div class="mb-6">
		<BackButton
			href="/brands"
			label="Brands"
		/>
	</div>

	{#if loading}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if error && !brand}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4">
			<p class="text-red-800">Error: {error}</p>
		</div>
	{:else if brand}
		<header class="mb-6 flex items-center gap-4">
			<Logo src={brand.logo} alt={brand.name} type="brand" id={brand.id} size="lg" />
			<div>
				<h1 class="text-3xl font-bold mb-2">{brand.name}</h1>
				<p class="text-gray-600">Brand ID: {brand.id}</p>
			</div>
		</header>

		{#if successMessage}
			<MessageBanner type="success" message={successMessage} />
		{/if}

		{#if error}
			<MessageBanner type="error" message={`Error: ${error}`} />
		{/if}

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
			<div class="bg-white border border-gray-200 rounded-lg p-6">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold">Brand Details</h2>
					<button
						onclick={openEditModal}
						class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
					>
						Edit
					</button>
				</div>

				<dl class="space-y-4">
					<div>
						<dt class="text-sm font-medium text-gray-500">Name</dt>
						<dd class="mt-1 text-lg">{brand.name}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Website</dt>
						<dd class="mt-1">
							<a href={brand.website} target="_blank" class="text-blue-600 hover:underline">
								{brand.website}
							</a>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Origin</dt>
						<dd class="mt-1">{brand.origin}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-gray-500">Logo</dt>
						<dd class="mt-1">{brand.logo}</dd>
					</div>
				</dl>
			</div>

			<div class="bg-white border border-gray-200 rounded-lg p-6">
				<h2 class="text-xl font-semibold mb-4">Materials</h2>

				{#if materials.length === 0}
					<p class="text-gray-500">No materials found for this brand.</p>
				{:else}
					<div class="space-y-2">
						{#each materials as material}
							<a
								href="/brands/{brandId}/{material.materialType}"
								class="block p-4 border border-gray-200 rounded hover:border-purple-500 hover:shadow-md transition-all"
							>
								<div class="flex items-center justify-between">
									<div>
										<h3 class="font-semibold">{material.material}</h3>
										<p class="text-xs text-gray-500">{material.materialType}</p>
									</div>
									<span class="text-gray-400">→</span>
								</div>
							</a>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
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
