<script lang="ts">
	import { onMount } from 'svelte';
	import type { Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, Button, LoadingSpinner } from '$lib/components/ui';
	import { BrandForm } from '$lib/components/forms';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { generateSlug } from '$lib/services/entityService';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { BackButton } from '$lib/components';

	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);

	let displayBrands = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		rootNamespace: 'brands',
		items: brands,
		getKeys: (b) => [b.id, b.slug],
		buildStub: (id, name) => ({ id, slug: id, name, logo: '', website: '', origin: '' } as Brand)
	}));

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => null,
		getEntity: () => null
	});

	let createError: string | null = $state(null);

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
			brands = index.brands.sort((a, b) => a.name.localeCompare(b.name));
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
		createError = null;
		entityState.openCreate();
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

	async function handleSubmit(data: any) {
		entityState.creating = true;
		createError = null;

		try {
			const slug = generateSlug(data.name);

			// Check for duplicate brand
			const duplicate = brands.find((b) => (b.slug ?? b.id).toLowerCase() === slug.toLowerCase());
			if (duplicate) {
				createError = `Brand "${data.name}" already exists`;
				entityState.creating = false;
				return;
			}

			let logoFilename = '';
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(slug, entityState.logoDataUrl, 'brand');
				if (!savedPath) {
					createError = 'Failed to save logo';
					entityState.creating = false;
					return;
				}
				logoFilename = savedPath;
			}

			const newBrandData = {
				...data,
				id: slug,
				slug: slug,
				logo: logoFilename
			};

			const success = await db.saveBrand(newBrandData);

			if (success) {
				messageHandler.showSuccess('Brand created successfully!');
				entityState.closeCreate();
				entityState.resetLogo();
				setTimeout(() => {
					window.location.href = `/brands/${slug}`;
				}, 500);
			} else {
				createError = 'Failed to create brand';
			}
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create brand';
		} finally {
			entityState.creating = false;
		}
	}
</script>

<svelte:head>
	<title>Brands</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<div class="mb-6">
		<BackButton href="/" label="Home" />

		{#if messageHandler.message}
			<MessageBanner type={messageHandler.type} message={messageHandler.message} />
		{/if}

		<div class="flex items-center justify-between mb-2">
			<h1 class="text-3xl font-bold">Brands</h1>
			<Button onclick={openCreateModal}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
					<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
				</svg>
				Add Brand
			</Button>
		</div>
		<p class="text-muted-foreground">Browse and edit filament brands and their materials</p>
	</div>

	<DataDisplay {loading} {error} data={displayBrands}>
		{#snippet children(brandsList)}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each brandsList as brand}
					{@const brandPath = `brands/${brand.id}`}
					{@const changeProps = getChildChangeProps($changes, $useChangeTracking, brandPath)}
					<EntityCard
						entity={brand}
						href="/brands/{brand.slug ?? brand.id}"
						logo={brand.logo}
						logoType="brand"
						logoEntityId={brand.slug ?? brand.id}
						hoverColor="green"
						fields={[
							{ key: 'origin', label: 'Origin', class: 'text-muted-foreground' },
							{ key: 'website', class: 'text-primary truncate' }
						]}
						hasLocalChanges={changeProps.hasLocalChanges}
						localChangeType={changeProps.localChangeType}
					/>
				{/each}
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showCreateModal} title="Create New Brand" onClose={() => { createError = null; entityState.closeCreate(); }} maxWidth="3xl">
	{#if createError}
		<MessageBanner type="error" message={createError} />
	{/if}
	{#if schema}
		<BrandForm
			brand={newBrand}
			{schema}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{:else}
		<div class="flex justify-center items-center py-12">
			<LoadingSpinner size="xl" class="text-primary" />
		</div>
	{/if}
</Modal>
