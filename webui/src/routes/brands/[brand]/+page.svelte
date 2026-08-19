<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Brand, Material } from '$lib/types/database';
	import { Modal, MessageBanner, Button, DeleteEntityModal, EntityActionDropdown, CloudCompareModal, DuplicateOptionsModal } from '$lib/components/ui';
	import { duplicateBrandChildren, loadBrandChildren, pasteBrandChildren, loadMaterialChildren, pasteMaterialChildren } from '$lib/services/duplicateService';
	import { BrandForm, MaterialForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { Logo, EntityDetails, EntityCard, ChildListPanel } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { createDeleteFlow } from '$lib/utils/useDeleteFlow.svelte';
	import { createCopyAction, createDuplicateAction, createPasteHandler } from '$lib/utils/useEntityActions.svelte';
	import { saveLogoImage } from '$lib/utils/logoManagement';
	import { db } from '$lib/services/database';
	import { generateMaterialType, generateSlug, mergeEntityData } from '$lib/services/entityService';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { untrack } from 'svelte';
	import { changes } from '$lib/stores/changes';
	import { submittedStore } from '$lib/stores/submitted';
	import { useChangeTracking } from '$lib/stores/environment';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { getCountryName } from '$lib/data/countryCodes';
	import { getClipboard } from '$lib/services/clipboardService';
	import { formDrafts } from '$lib/stores/formDrafts';

	let brandId: string = $derived($page.params.brand!);
	let brandEditDraftKey = $derived(`edit:brand:${brandId}`);
	let materialCreateDraftKey = $derived(`create:material:${brandId}`);
	const BRAND_CREATE_DRAFT_KEY = 'create:brand';
	let loadGeneration = 0;
	let brand: Brand | null = $state(null);
	let originalBrand: Brand | null = $state(null);
	let materials: Material[] = $state([]);
	let schema: any = $state(null);
	let materialSchema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	let showCreateMaterialModal: boolean = $state(false);
	let creatingMaterial: boolean = $state(false);
	let createMaterialError: string | null = $state(null);
	let duplicateBrandError: string | null = $state(null);
	let prefillMaterialData: Material | null = $state(null);

	let displayMaterials = $derived.by(() => withDeletedStubs({
		changes: $changes,
		submitted: submittedStore,
		useChangeTracking: $useChangeTracking,
		parentPath: `brands/${brandId}`,
		namespace: 'materials',
		items: materials,
		getKeys: (m) => [m.id, m.materialType, m.material?.toLowerCase()],
		buildStub: (id, name) => ({ id, materialType: id, material: name } as unknown as Material)
	}));

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => brand ? `brands/${brandId}` : null,
		getEntity: () => brand
	});

	const deleteFlow = createDeleteFlow(messageHandler);

	// --- Shared actions for THIS brand (detail-level) ---
	const brandCopy = createCopyAction('brand', async (_data, _path) => {
		return await loadBrandChildren(brandId);
	});
	const brandDuplicate = createDuplicateAction('brand', true, (data) => {
		formDrafts.clear(BRAND_CREATE_DRAFT_KEY);
		entityState.openDuplicate(data);
	});

	// --- Shared actions for MATERIAL cards in the list ---
	const materialCopy = createCopyAction('material', async (data) => {
		const matType = data.materialType ?? data.material?.toUpperCase();
		return await loadMaterialChildren(brandId, matType);
	});
	const materialDuplicate = createDuplicateAction('material', true, (data) => {
		createMaterialError = null;
		formDrafts.clear(materialCreateDraftKey);
		prefillMaterialData = data as Material;
		showCreateMaterialModal = true;
	});
	const materialPaste = createPasteHandler('material', (data) => {
		createMaterialError = null;
		formDrafts.clear(materialCreateDraftKey);
		prefillMaterialData = data as Material;
		showCreateMaterialModal = true;
	}, (data) => {
		const newMaterialType = generateMaterialType(data.material);
		return !!materials.find(
			(m) => (m.materialType || m.material || '').toLowerCase() === newMaterialType.toLowerCase()
		);
	});

	$effect(() => {
		if (!showCreateMaterialModal) {
			prefillMaterialData = null;
		}
	});

	// --- Data loading ---
	$effect(() => {
		const id = brandId;
		const gen = ++loadGeneration;

		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
				const [brandData, materialsData, schemaData, matSchemaData] = await Promise.all([
					db.getBrand(id),
					db.loadMaterials(id),
					fetchEntitySchema('brand'),
					fetchEntitySchema('material')
				]);

				if (gen !== loadGeneration) return;

				if (!brandData) {
					const brandPath = `brands/${id}`;
					const change = untrack(() => $changes.get(brandPath));
					if (untrack(() => $useChangeTracking) && change?.operation === 'delete') {
						error = 'This brand has been deleted in your local changes. Export your changes to finalize the deletion.';
					} else {
						error = 'Brand not found';
					}
					loading = false;
					return;
				}

				brand = brandData;
				originalBrand = structuredClone(brandData);
				materials = materialsData;
				schema = schemaData;
				materialSchema = matSchemaData;

			} catch (e) {
				if (gen !== loadGeneration) return;
				error = e instanceof Error ? e.message : 'Failed to load brand';
			} finally {
				if (gen === loadGeneration) {
					loading = false;
				}
			}
		})();
	});

	// --- Edit handler ---
	async function handleSubmit(data: any) {
		if (!brand) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
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

			// Spread the original brand first (via mergeEntityData) so cloud-origin
			// fields the form never emits — notably `logo_name`/`logo_slug` — survive
			// into the tracked change. cleanEntityData rebuilds the schema-valid `logo`
			// from `logo_name`; without it, editing any other field (e.g. the URL)
			// would leave the cloud CDN logo ref in place and trip logo-pattern
			// validation. Mirrors the store edit path.
			const updatedBrand = mergeEntityData(
				brand as unknown as Record<string, unknown>,
				{ ...data, logo: logoFilename },
				['id', 'slug']
			) as unknown as Brand;
			if (!updatedBrand.slug) updatedBrand.slug = brandId;

			const success = await db.saveBrand(updatedBrand, originalBrand ?? brand);

			if (success) {
				brand = updatedBrand;
				entityState.resetLogo();
				messageHandler.showSuccess('Brand saved successfully!');
				formDrafts.clear(brandEditDraftKey);
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

	// --- Create material handler ---
	function openCreateMaterialModal() {
		createMaterialError = null;
		showCreateMaterialModal = true;
	}

	async function handleCreateMaterial(data: any) {
		if (!brand) return;

		creatingMaterial = true;
		createMaterialError = null;

		try {
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
				// Paste children from clipboard if this was a paste action
				const clip = getClipboard();
				if (clip?.entityType === 'material' && clip.children && prefillMaterialData) {
					try {
						await pasteMaterialChildren(brandId, result.materialType, clip.children);
					} catch (e) {
						console.error('Failed to paste children:', e);
					}
				}
				messageHandler.showSuccess('Material created successfully!');
				formDrafts.clear(materialCreateDraftKey);
				showCreateMaterialModal = false;
				goto(`/brands/${brandId}/${result.materialType!}`);
			} else {
				createMaterialError = 'Failed to create material';
			}
		} catch (e) {
			createMaterialError = e instanceof Error ? e.message : 'Failed to create material';
		} finally {
			creatingMaterial = false;
		}
	}

	// --- Delete brand (redirect-first) ---
	function openDeleteBrand() {
		if (!brand) return;
		deleteFlow.open({
			type: 'brand',
			path: `brands/${brandId}`,
			label: 'Brand',
			name: brand.name,
			uuid: brand.uuid,
			movedFrom: brand.moved_from,
			deleteFn: () => db.deleteBrand(brandId, brand!),
			navigateOnDelete: '/brands'
		});
	}

	// --- Duplicate/paste brand submit handler ---
	async function handleDuplicateBrandSubmit(data: any) {
		entityState.creating = true;
		duplicateBrandError = null;

		try {
			const slug = generateSlug(data.name);
			const existingBrands = await db.loadBrands();
			const dup = existingBrands.find((b) => (b.slug ?? b.id).toLowerCase() === slug.toLowerCase());
			if (dup) {
				duplicateBrandError = `Brand "${data.name}" already exists`;
				entityState.creating = false;
				return;
			}

			let logoFilename = '';
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(slug, entityState.logoDataUrl, 'brand');
				if (!savedPath) {
					duplicateBrandError = 'Failed to save logo';
					entityState.creating = false;
					return;
				}
				logoFilename = savedPath;
			}

			const newBrandData = { ...data, id: slug, slug, logo: logoFilename };
			const success = await db.saveBrand(newBrandData);

			if (success) {
				if (brandDuplicate.withChildren && brand) {
					try {
						await duplicateBrandChildren(brandId, slug, true);
					} catch (e) {
						console.error('Failed to duplicate children:', e);
					}
				}
				const clip = getClipboard();
				if (clip?.children && entityState.showPasteModal) {
					try {
						await pasteBrandChildren(slug, clip.children);
					} catch (e) {
						console.error('Failed to paste children:', e);
					}
				}
				messageHandler.showSuccess('Brand created successfully!');
				formDrafts.clear(BRAND_CREATE_DRAFT_KEY);
				entityState.closeDuplicate();
				entityState.closePaste();
				goto(`/brands/${slug}`);
			} else {
				duplicateBrandError = 'Failed to create brand';
			}
		} catch (e) {
			duplicateBrandError = e instanceof Error ? e.message : 'Failed to duplicate brand';
		} finally {
			entityState.creating = false;
		}
	}

	// --- Delete material from card (same modal, stays on this page) ---
	function openDeleteMaterial(material: Material) {
		const matType = material.materialType ?? material.material.toLowerCase();
		deleteFlow.open({
			type: 'material',
			path: `brands/${brandId}/materials/${matType}`,
			label: 'Material',
			name: material.material,
			uuid: material.uuid,
			movedFrom: material.moved_from,
			deleteFn: () => db.deleteMaterial(brandId, matType, material),
			navigateOnDelete: null,
			onSuccess: () => {
				materials = materials.filter((m) => (m.materialType ?? m.material.toLowerCase()) !== matType);
			}
		});
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
				</div>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{:else if entityState.hasSubmittedChanges}
				<MessageBanner type="info" message="Submitted - awaiting merge" />
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
						{ key: 'origin', format: (v: string) => getCountryName(v) },
						{ key: 'logo', type: 'logo', logoType: 'brand', logoEntityId: brandData.slug ?? brandData.id }
					]}
				>
					{#snippet actions()}
						<div class="flex gap-2">
							<Button onclick={entityState.openEdit} variant="primary">Edit</Button>
							<EntityActionDropdown
								entityType="brand"
								entityData={brandData}
								entityPath="brands/{brandId}"
								isLocalCreate={entityState.isLocalCreate}
								onDuplicate={() => brandDuplicate.request(brandData)}
								onCopyRequest={() => brandCopy.request(brandData, `brands/${brandId}`)}
								onPaste={(data) => { formDrafts.clear(BRAND_CREATE_DRAFT_KEY); entityState.openPaste(data); }}
								onDelete={openDeleteBrand}
								onViewDiff={entityState.openCloudCompare}
							/>
						</div>
					{/snippet}
				</EntityDetails>

				<ChildListPanel
					title="Materials"
					addLabel="Add Material"
					onAdd={openCreateMaterialModal}
					itemCount={displayMaterials.length}
					emptyMessage="No materials found for this brand."
					childEntityType="material"
					onPaste={materialPaste}
				>
					{#each displayMaterials as material}
						{@const materialHref = `/brands/${brandData.slug ?? brandData.id}/${material.materialType ?? material.material.toLowerCase()}`}
						{@const materialPath = `brands/${brandId}/materials/${material.materialType ?? material.material.toLowerCase()}`}
						{@const changeProps = getChildChangeProps($changes, $useChangeTracking, materialPath, submittedStore)}
						<EntityCard
							entity={material}
							href={materialHref}
							name={material.material}
							id={material.materialType ?? material.material}
							hoverColor="purple"
							showLogo={false}
							hasLocalChanges={changeProps.hasLocalChanges}
							localChangeType={changeProps.localChangeType}
							hasSubmittedChanges={changeProps.hasSubmittedChanges}
							submittedChangeType={changeProps.submittedChangeType}
							entityType="material"
							onCopy={() => materialCopy.request(material, materialPath)}
							onDuplicate={() => materialDuplicate.request(material)}
							onPaste={materialPaste}
							onDelete={changeProps.localChangeType === 'delete' || changeProps.submittedChangeType === 'delete'
								? undefined
								: () => openDeleteMaterial(material)}
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
			draftKey={brandEditDraftKey}
			onSubmit={handleSubmit}
			onLogoChange={entityState.handleLogoChange}
			logoChanged={entityState.logoChanged}
			saving={entityState.saving}
		/>
	{/if}
</Modal>

<DeleteEntityModal
	show={deleteFlow.show}
	source={deleteFlow.source}
	isLocalCreate={deleteFlow.isLocalCreate}
	cascadeWarning={deleteFlow.cascadeWarning}
	busy={deleteFlow.busy}
	resolving={deleteFlow.resolving}
	error={deleteFlow.error}
	onClose={deleteFlow.close}
	onConfirm={deleteFlow.confirm}
/>

<!-- Copy/Duplicate options modals (brand-level) -->
<DuplicateOptionsModal show={brandCopy.showOptions} onClose={brandCopy.close} onSelect={brandCopy.select} title="Copy Brand"
	childrenDescription="Copies all materials, filaments, and variants into the clipboard along with the brand." />
<DuplicateOptionsModal show={brandDuplicate.showOptions} onClose={brandDuplicate.close} onSelect={brandDuplicate.select} title="Duplicate Brand"
	childrenDescription="Copies all materials, filaments, and variants under this brand into the new duplicate." />

<!-- Copy/Duplicate options modals (material cards) -->
<DuplicateOptionsModal show={materialCopy.showOptions} onClose={materialCopy.close} onSelect={materialCopy.select} title="Copy Material"
	childrenDescription="Copies all filaments and variants into the clipboard along with the material." />
<DuplicateOptionsModal show={materialDuplicate.showOptions} onClose={materialDuplicate.close} onSelect={materialDuplicate.select} title="Duplicate Material"
	childrenDescription="Copies all filaments and variants under this material into the new duplicate." />

<!-- Duplicate Brand Modal -->
<Modal show={entityState.showDuplicateModal} title="Duplicate Brand" onClose={entityState.closeDuplicate} maxWidth="3xl">
	{#if duplicateBrandError}
		<MessageBanner type="error" message={duplicateBrandError} />
	{/if}
	{#if entityState.duplicateData && schema}
		<BrandForm brand={entityState.duplicateData} {schema} draftKey={BRAND_CREATE_DRAFT_KEY} onSubmit={handleDuplicateBrandSubmit}
			onLogoChange={entityState.handleLogoChange} logoChanged={entityState.logoChanged} saving={entityState.creating} />
	{/if}
</Modal>

<!-- Paste Brand Modal -->
<Modal show={entityState.showPasteModal} title="Paste Brand" onClose={entityState.closePaste} maxWidth="3xl">
	{#if duplicateBrandError}
		<MessageBanner type="error" message={duplicateBrandError} />
	{/if}
	{#if entityState.pasteData && schema}
		<BrandForm brand={entityState.pasteData} {schema} draftKey={BRAND_CREATE_DRAFT_KEY} onSubmit={handleDuplicateBrandSubmit}
			onLogoChange={entityState.handleLogoChange} logoChanged={entityState.logoChanged} saving={entityState.creating} />
	{/if}
</Modal>

<!-- Cloud Compare Modal -->
<CloudCompareModal show={entityState.showCloudCompareModal} onClose={entityState.closeCloudCompare}
	title="Compare Brand with Cloud" currentData={brand} apiPath="/api/brands/{brandId}" />

<Modal show={showCreateMaterialModal} title="Create New Material" onClose={() => { createMaterialError = null; showCreateMaterialModal = false; }} maxWidth="5xl" height="3/4">
	{#if createMaterialError}
		<MessageBanner type="error" message={createMaterialError} />
	{/if}
	{#if materialSchema}
		<MaterialForm schema={materialSchema} entity={prefillMaterialData ?? undefined}
			draftKey={materialCreateDraftKey}
			config={{ excludeEnumValues: { material: materials.map(m => m.material) } }}
			onSubmit={handleCreateMaterial} saving={creatingMaterial} />
	{/if}
</Modal>
