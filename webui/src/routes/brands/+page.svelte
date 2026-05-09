<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { Brand } from '$lib/types/database';
	import { db } from '$lib/services/database';
	import { Modal, MessageBanner, Button, LoadingSpinner, SearchBar } from '$lib/components/ui';
	import { BrandForm } from '$lib/components/forms';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { generateSlug } from '$lib/services/entityService';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { submittedStore } from '$lib/stores/submitted';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { BackButton } from '$lib/components';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { getCountryName } from '$lib/data/countryCodes';
	import { hasCompatibleClipboard } from '$lib/services/clipboardService';
	import { createCopyAction, createDuplicateAction, createPasteHandler } from '$lib/utils/useEntityActions.svelte';
	import { loadBrandChildren } from '$lib/services/duplicateService';
	import { DuplicateOptionsModal } from '$lib/components/ui';
	import { formDrafts } from '$lib/stores/formDrafts';

	const BRAND_CREATE_DRAFT_KEY = 'create:brand';

	let brands: Brand[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);
	let searchQuery: string = $state('');

	let displayBrands = $derived.by(() => withDeletedStubs({
		changes: $changes,
		submitted: submittedStore,
		useChangeTracking: $useChangeTracking,
		rootNamespace: 'brands',
		items: brands,
		getKeys: (b) => [b.id, b.slug],
		buildStub: (id, name) => ({ id, slug: id, name, logo: '', website: '', origin: '' } as Brand)
	}));

	let filteredBrands = $derived.by(() => {
		const q = searchQuery.toLowerCase().trim();
		if (!q) return displayBrands;
		return displayBrands.filter((b) => {
			const fields = [b.name, b.id, b.slug, b.origin, b.website].filter(Boolean);
			return fields.some((f) => f!.toLowerCase().includes(q));
		});
	});

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => null,
		getEntity: () => null
	});

	let createError: string | null = $state(null);
	let schemaError: string | null = $state(null);

	let prefillBrandData: Brand | null = $state(null);

	function newBrand(): Brand {
		return prefillBrandData ?? {
			id: '',
			name: '',
			logo: '',
			website: '',
			origin: ''
		};
	}

	// Shared actions for brand cards
	const brandCopy = createCopyAction('brand', async (data) => {
		return await loadBrandChildren(data.slug ?? data.id);
	});
	const brandDuplicate = createDuplicateAction('brand', true, (data) => {
		formDrafts.clear(BRAND_CREATE_DRAFT_KEY);
		prefillBrandData = data as Brand;
		openCreateModal();
	});
	const brandPaste = createPasteHandler('brand', (data) => {
		formDrafts.clear(BRAND_CREATE_DRAFT_KEY);
		prefillBrandData = data as Brand;
		openCreateModal();
	}, (data) => {
		const slug = generateSlug(data.name);
		return !!(brands.find((b) => (b.slug ?? b.id).toLowerCase() === slug.toLowerCase()) ||
			brands.find((b) => b.name.toLowerCase() === data.name.trim().toLowerCase()));
	});

	$effect(() => {
		if (!entityState.showCreateModal) {
			prefillBrandData = null;
		}
	});

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

	function openCreateModal() {
		createError = null;
		schemaError = null;
		entityState.openCreate();
		if (!schema) {
			fetchEntitySchema('brand')
				.then((data) => {
					if (!data) {
						schemaError = 'Failed to load schema';
						return;
					}
					schema = data;
				})
				.catch((e) => {
					console.error('Failed to load schema:', e);
					schemaError = e instanceof Error ? e.message : 'Failed to load schema';
				});
		}
	}

	async function handleSubmit(data: any) {
		entityState.creating = true;
		createError = null;

		try {
			const slug = generateSlug(data.name);

			// Check for duplicate brand by slug/path and by name
			const duplicateBySlug = brands.find((b) =>
				(b.slug ?? b.id).toLowerCase() === slug.toLowerCase()
			);
			const duplicateByName = brands.find((b) =>
				b.name.toLowerCase() === data.name.trim().toLowerCase()
			);
			if (duplicateBySlug || duplicateByName) {
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
				formDrafts.clear(BRAND_CREATE_DRAFT_KEY);
				entityState.closeCreate();
				entityState.resetLogo();
				goto(`/brands/${slug}`);
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
			<div class="flex gap-2">
				{#if hasCompatibleClipboard('brand')}
					<Button onclick={brandPaste} variant="outline">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
							<path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
							<path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
						</svg>
						Paste Brand
					</Button>
				{/if}
				<Button onclick={openCreateModal}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
					</svg>
					Add Brand
				</Button>
			</div>
		</div>
		<p class="text-muted-foreground">Browse and edit filament brands and their materials</p>
	</div>

	<DataDisplay {loading} {error} data={displayBrands}>
		{#snippet children(brandsList)}
			<div class="mb-4">
				<SearchBar
					value={searchQuery}
					placeholder="Search brands by name, origin, website..."
					oninput={(v) => searchQuery = v}
				/>
				{#if searchQuery}
					<p class="text-xs text-muted-foreground mt-1">
						{filteredBrands.length} of {brandsList.length} brands shown
					</p>
				{/if}
			</div>
			{#if searchQuery && filteredBrands.length === 0}
				<p class="text-muted-foreground">No brands matching "{searchQuery}"</p>
			{:else}
			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each filteredBrands as brand}
					{@const brandPath = `brands/${brand.slug ?? brand.id}`}
					{@const changeProps = getChildChangeProps($changes, $useChangeTracking, brandPath, submittedStore)}
					<EntityCard
						entity={brand}
						href="/brands/{brand.slug ?? brand.id}"
						logo={brand.logo}
						logoType="brand"
						logoEntityId={brand.slug ?? brand.id}
						hoverColor="green"
						fields={[
							{ key: 'origin', label: 'Origin', class: 'text-muted-foreground', format: (v: string) => getCountryName(v) },
							{ key: 'website', class: 'text-primary truncate' }
						]}
						hasLocalChanges={changeProps.hasLocalChanges}
						localChangeType={changeProps.localChangeType}
						hasSubmittedChanges={changeProps.hasSubmittedChanges}
						submittedChangeType={changeProps.submittedChangeType}
						entityType="brand"
						onCopy={() => brandCopy.request(brand, `brands/${brand.slug ?? brand.id}`)}
						onDuplicate={() => brandDuplicate.request(brand)}
						onPaste={brandPaste}
					/>
				{/each}
			</div>
			{/if}
		{/snippet}
	</DataDisplay>
</div>

<!-- Copy/Duplicate options modals for brand cards -->
<DuplicateOptionsModal show={brandCopy.showOptions} onClose={brandCopy.close} onSelect={brandCopy.select} title="Copy Brand"
	childrenDescription="Copies all materials, filaments, and variants into the clipboard along with the brand." />
<DuplicateOptionsModal show={brandDuplicate.showOptions} onClose={brandDuplicate.close} onSelect={brandDuplicate.select} title="Duplicate Brand"
	childrenDescription="Copies all materials, filaments, and variants under this brand into the new duplicate." />

<Modal show={entityState.showCreateModal} title="Create New Brand" onClose={() => { createError = null; entityState.closeCreate(); }} maxWidth="3xl">
	{#if createError}
		<MessageBanner type="error" message={createError} />
	{/if}
	{#if schema}
		<BrandForm
			brand={newBrand()}
			{schema}
			draftKey={BRAND_CREATE_DRAFT_KEY}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.creating}
		/>
	{:else if schemaError}
		<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{schemaError}</div>
	{:else}
		<div class="flex justify-center items-center py-12">
			<LoadingSpinner size="xl" class="text-primary" />
		</div>
	{/if}
</Modal>
