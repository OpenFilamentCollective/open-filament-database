<script lang="ts">
	import { onMount } from 'svelte';
	import type { Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { BrandForm } from '$lib/components/forms';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { saveLogoImage } from '$lib/utils/logoManagement';

	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	let showCreateModal: boolean = $state(false);
	let schema: any = $state(null);
	let saving: boolean = $state(false);
	let logoDataUrl: string = $state('');
	let logoChanged: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Empty brand template for new brand creation
	const newBrand: Brand = {
		id: '',
		name: '',
		logo: '',
		website: '',
		origin: ''
	};

	async function loadData() {
		loading = true;
		error = null;
		try {
			const index = await db.loadIndex();
			brands = index.brands;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load brands';
		} finally {
			loading = false;
		}
	}

	onMount(loadData);

	// Reload when navigating back to this page
	$effect(() => {
		// This effect will run whenever the component is shown
		if (typeof window !== 'undefined') {
			loadData();
		}
	});

	function openCreateModal() {
		showCreateModal = true;
		// Load schema when modal opens
		if (!schema) {
			fetch('/api/schemas/brand')
				.then((r) => r.json())
				.then((data) => {
					schema = data;
				})
				.catch((e) => {
					console.error('Failed to load schema:', e);
				});
		}
	}

	function closeCreateModal() {
		showCreateModal = false;
		logoChanged = false;
		logoDataUrl = '';
	}

	async function handleSubmit(data: any) {
		saving = true;
		messageHandler.clear();

		try {
			// Generate slug from name (URL-friendly format with hyphens)
			const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

			// If logo was uploaded, save it
			let logoFilename = '';
			if (logoChanged && logoDataUrl) {
				const savedPath = await saveLogoImage(slug, logoDataUrl, 'brand');
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					saving = false;
					return;
				}
				// In cloud mode, savedPath is the imageId for change store lookup
				// In local mode, savedPath is the filename
				logoFilename = savedPath;
			}

			// Create new brand with generated ID and slug
			const newBrandData = {
				...data,
				id: slug,
				slug: slug,
				logo: logoFilename
			};

			const success = await db.saveBrand(newBrandData);

			if (success) {
				messageHandler.showSuccess('Brand created successfully!');
				showCreateModal = false;
				logoChanged = false;
				logoDataUrl = '';

				// Reload the page to ensure UI is in sync
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create brand');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create brand');
		} finally {
			saving = false;
		}
	}

	function handleLogoChange(dataUrl: string) {
		logoDataUrl = dataUrl;
		logoChanged = true;
	}
</script>

<svelte:head>
	<title>Brands</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<a href="/" class="text-primary hover:text-primary flex items-center gap-2 mb-4">
			← Back to Home
		</a>

		{#if messageHandler.message}
			<MessageBanner type={messageHandler.type} message={messageHandler.message} />
		{/if}

		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Brands</h1>
			<button
				onclick={openCreateModal}
				class="bg-green-600 text-white hover:bg-green-700 px-4 py-2 rounded-md font-medium flex items-center gap-2"
			>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Brand
			</button>
		</div>
		<p class="text-muted-foreground">Browse and edit filament brands and their materials</p>
	</div>

	<DataDisplay {loading} {error} data={brands}>
		{#snippet children(brandsList)}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each brandsList as brand}
					<EntityCard
						entity={brand}
						href="/brands/{brand.slug ?? brand.id}"
						logo={brand.logo}
						logoType="brand"
						logoEntityId={brand.id}
						hoverColor="green"
						fields={[
							{ key: 'origin', label: 'Origin', class: 'text-muted-foreground' },
							{ key: 'website', class: 'text-primary truncate' }
						]}
					/>
				{/each}
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showCreateModal} title="Create New Brand" onClose={closeCreateModal} maxWidth="3xl">
	{#if schema}
		<BrandForm
			brand={newBrand}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={handleLogoChange}
			{logoChanged}
			{saving}
		/>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
		</div>
	{/if}
</Modal>
