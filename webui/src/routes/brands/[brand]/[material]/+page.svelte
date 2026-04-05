<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Material, Filament } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, Button, EntityActionDropdown, CloudCompareModal, DuplicateOptionsModal } from '$lib/components/ui';
	import { duplicateMaterialChildren, loadMaterialChildren, pasteMaterialChildren, loadFilamentChildren, pasteFilamentChildren } from '$lib/services/duplicateService';
	import { MaterialForm, FilamentForm } from '$lib/components/forms';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard, SlicerSettingsDisplay, ChildListPanel } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { createCopyAction, createDuplicateAction, createPasteHandler } from '$lib/utils/useEntityActions.svelte';
	import { deleteEntity, generateSlug, generateMaterialType } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { untrack } from 'svelte';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { getClipboard } from '$lib/services/clipboardService';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let loadGeneration = 0;
	let material: Material | null = $state(null);
	let originalMaterial: Material | null = $state(null);
	let filaments: Filament[] = $state([]);
	let siblingMaterials: Material[] = $state([]);
	let materialSchema: any = $state(null);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let createError: string | null = $state(null);
	let filamentSearch: string = $state('');
	let duplicateMaterialError: string | null = $state(null);
	let prefillFilamentData: Filament | null = $state(null);

	let displayFilaments = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		parentPath: `brands/${brandId}/materials/${materialType}`,
		namespace: 'filaments',
		items: filaments,
		getKeys: (f) => [f.id, (f as any).slug],
		buildStub: (id, name) => ({ id, slug: id, name } as unknown as Filament)
	}));

	let filteredFilaments = $derived.by(() => {
		const q = filamentSearch.toLowerCase().trim();
		if (!q) return displayFilaments;
		return displayFilaments.filter((f) => {
			const certs = f.certifications?.join(' ') ?? '';
			const fields = [f.name, f.id, f.slug, certs].filter(Boolean);
			if (f.discontinued && 'discontinued'.includes(q)) return true;
			return fields.some((v) => String(v).toLowerCase().includes(q));
		});
	});

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			material
				? `brands/${brandId}/materials/${material.materialType ?? materialType}`
				: null,
		getEntity: () => material
	});

	// --- Shared actions for THIS material (detail-level) ---
	const materialCopy = createCopyAction('material', async () => {
		return await loadMaterialChildren(brandId, materialType);
	});
	const materialDuplicate = createDuplicateAction('material', true, (data) => {
		entityState.openDuplicate(data);
	});

	// --- Shared actions for FILAMENT cards in the list ---
	const filamentCopy = createCopyAction('filament', async (data) => {
		const filId = data.slug ?? data.id;
		return await loadFilamentChildren(brandId, materialType, filId);
	});
	const filamentDuplicate = createDuplicateAction('filament', true, (data) => {
		createError = null;
		prefillFilamentData = data as Filament;
		entityState.openCreate();
	});
	const filamentPaste = createPasteHandler('filament', (data) => {
		createError = null;
		prefillFilamentData = data as Filament;
		entityState.openCreate();
	}, (data) => {
		const filamentSlug = generateSlug(data.name);
		return !!(filaments.find((f) => (f.slug ?? f.id).toLowerCase() === filamentSlug) ||
			filaments.find((f) => f.name.toLowerCase() === data.name.trim().toLowerCase()));
	});

	$effect(() => {
		if (!entityState.showCreateModal) {
			prefillFilamentData = null;
		}
	});

	// --- Data loading ---
	$effect(() => {
		const brand = brandId;
		const matType = materialType;
		const gen = ++loadGeneration;

		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
				const [materialData, filamentsData, schema, allMaterials] = await Promise.all([
					db.getMaterial(brand, matType),
					db.loadFilaments(brand, matType),
					fetchEntitySchema('material'),
					db.loadMaterials(brand)
				]);

				if (gen !== loadGeneration) return;

				if (!materialData) {
					const materialPath = `brands/${brand}/materials/${matType}`;
					const change = untrack(() => $changes.get(materialPath));
					if (untrack(() => $useChangeTracking) && change?.operation === 'delete') {
						error = 'This material has been deleted in your local changes. Export your changes to finalize the deletion.';
					} else {
						error = 'Material not found';
					}
					loading = false;
					return;
				}

				material = materialData;
				materialSchema = schema;
				siblingMaterials = allMaterials;
				const trueOriginal = db.getOriginalMaterial(brand, matType);
				originalMaterial = trueOriginal ? structuredClone(trueOriginal) : structuredClone(materialData);
				filaments = filamentsData;
			} catch (e) {
				if (gen !== loadGeneration) return;
				error = e instanceof Error ? e.message : 'Failed to load material';
			} finally {
				if (gen === loadGeneration) {
					loading = false;
				}
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!material) return;
		entityState.saving = true;
		messageHandler.clear();
		try {
			const existingType = material.materialType ?? materialType;
			const updatedMaterial: Material = { ...(originalMaterial ?? material), ...data, id: existingType, materialType: existingType };
			const orig = originalMaterial ?? material;
			if (!('material_class' in data)) {
				delete (updatedMaterial as any).material_class;
			} else if (orig && !('material_class' in (orig as Record<string, any>)) && data.material_class === 'FFF') {
				delete (updatedMaterial as any).material_class;
			}
			const success = await db.saveMaterial(brandId, materialType, updatedMaterial, originalMaterial ?? material);
			if (success) {
				material = updatedMaterial;
				messageHandler.showSuccess('Material saved successfully!');
				entityState.closeEdit();
			} else {
				messageHandler.showError('Failed to save material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save material');
		} finally {
			entityState.saving = false;
		}
	}

	async function handleDelete() {
		if (!material) return;
		entityState.deleting = true;
		messageHandler.clear();
		try {
			const result = await deleteEntity(`brands/${brandId}/materials/${materialType}`, 'Material',
				() => db.deleteMaterial(brandId, materialType, material!));
			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				entityState.deleting = false;
				setTimeout(() => goto(`/brands/${brandId}`), 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete material');
			entityState.deleting = false;
		}
	}

	async function handleCreateFilament(data: any) {
		entityState.creating = true;
		createError = null;
		try {
			const filamentSlug = generateSlug(data.name);
			if (filaments.find((f) => (f.slug ?? f.id).toLowerCase() === filamentSlug) ||
				filaments.find((f) => f.name.toLowerCase() === data.name.trim().toLowerCase())) {
				createError = `Filament "${data.name}" already exists in this material`;
				entityState.creating = false;
				return;
			}
			const result = await db.createFilament(brandId, materialType, data);
			if (result.success && result.filamentId) {
				// Paste children from clipboard if this was a paste action
				const clip = getClipboard();
				if (clip?.entityType === 'filament' && clip.children && prefillFilamentData) {
					try {
						await pasteFilamentChildren(brandId, materialType, result.filamentId, clip.children);
					} catch (e) {
						console.error('Failed to paste children:', e);
					}
				}
				messageHandler.showSuccess('Filament created successfully!');
				entityState.closeCreate();
				goto(`/brands/${brandId}/${materialType}/${result.filamentId}`);
			} else {
				createError = 'Failed to create filament';
			}
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create filament';
		} finally {
			entityState.creating = false;
		}
	}

	// --- Duplicate material submit ---
	async function handleDuplicateMaterialSubmit(data: any) {
		entityState.creating = true;
		duplicateMaterialError = null;
		try {
			const newMaterialType = generateMaterialType(data.material);
			if (siblingMaterials.find((m) => (m.materialType || m.material || '').toLowerCase() === newMaterialType.toLowerCase())) {
				duplicateMaterialError = `Material "${data.material}" already exists in this brand`;
				entityState.creating = false;
				return;
			}
			const result = await db.createMaterial(brandId, data);
			if (result.success && result.materialType) {
				if (materialDuplicate.withChildren && material) {
					try {
						await duplicateMaterialChildren(brandId, material.materialType ?? materialType, brandId, result.materialType, true);
					} catch (e) { console.error('Failed to duplicate children:', e); }
				}
				const clip = getClipboard();
				if (clip?.children && entityState.showPasteModal) {
					try {
						await pasteMaterialChildren(brandId, result.materialType, clip.children);
					} catch (e) { console.error('Failed to paste children:', e); }
				}
				messageHandler.showSuccess('Material created successfully!');
				entityState.closeDuplicate();
				entityState.closePaste();
				goto(`/brands/${brandId}/${result.materialType}`);
			} else {
				duplicateMaterialError = 'Failed to create material';
			}
		} catch (e) {
			duplicateMaterialError = e instanceof Error ? e.message : 'Failed to duplicate material';
		} finally {
			entityState.creating = false;
		}
	}

	async function handleDeleteFilament(filament: Filament) {
		const fId = filament.slug ?? filament.id;
		try {
			const result = await deleteEntity(`brands/${brandId}/materials/${materialType}/filaments/${fId}`, 'Filament',
				() => db.deleteFilament(brandId, materialType, fId, filament));
			if (result.success) {
				messageHandler.showSuccess(result.message);
				filaments = filaments.filter((f) => (f.slug ?? f.id) !== fId);
			} else {
				messageHandler.showError(result.message);
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete filament');
		}
	}
</script>

{#snippet slicerSettingsRender(settings: Record<string, any>)}
	<SlicerSettingsDisplay {settings} />
{/snippet}

<svelte:head>
	<title>{material ? `${material.material}` : 'Material Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<BackButton href="/brands/{brandId}" label="Brand" />

	<DataDisplay {loading} {error} data={material}>
		{#snippet children(materialData)}
			<header class="mb-6">
				<h1 class="text-3xl font-bold mb-2">{materialData.material}</h1>
				<p class="text-muted-foreground">ID: {String(materialData.materialType ?? materialType).toUpperCase()}</p>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}
			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityDetails entity={materialData} title="Material Details"
					fields={[
						{ key: 'material', label: 'Material Type' },
						{ key: 'material_class', label: 'Material Class', hide: (v) => !v },
						{ key: 'default_max_dry_temperature', label: 'Max Dry Temperature', format: (v) => `${v}°C`, hide: (v) => !v },
						{ key: 'default_slicer_settings', label: 'Default Slicer Settings', hide: (v) => !v || Object.keys(v).length === 0, customRender: slicerSettingsRender }
					]}>
					{#snippet actions()}
						<div class="flex gap-2">
							<Button onclick={entityState.openEdit} variant="primary">Edit</Button>
							<EntityActionDropdown
								entityType="material" entityData={materialData}
								entityPath="brands/{brandId}/materials/{materialType}"
								isLocalCreate={entityState.isLocalCreate}
								onDuplicate={() => materialDuplicate.request(materialData)}
								onCopyRequest={() => materialCopy.request(materialData, `brands/${brandId}/materials/${materialType}`)}
								onPaste={(data) => entityState.openPaste(data)}
								onDelete={entityState.openDelete}
								onViewDiff={entityState.openCloudCompare}
								parentNames={{ brand: '' }}
							/>
						</div>
					{/snippet}
				</EntityDetails>

				<ChildListPanel title="Filaments" addLabel="Add Filament"
					onAdd={() => { createError = null; entityState.openCreate(); }}
					itemCount={displayFilaments.length} emptyMessage="No filaments found for this material."
					searchQuery={filamentSearch} onSearch={(v) => filamentSearch = v}
					searchPlaceholder="Search filaments..." filteredCount={filteredFilaments.length}
					childEntityType="filament" onPaste={filamentPaste}>
					{#each filteredFilaments as filament}
						{@const filamentHref = `/brands/${brandId}/${materialType}/${filament.slug ?? filament.id}`}
						{@const filamentPath = `brands/${brandId}/materials/${materialType}/filaments/${filament.slug ?? filament.id}`}
						{@const changeProps = getChildChangeProps($changes, $useChangeTracking, filamentPath)}
						<EntityCard entity={filament} href={filamentHref} name={filament.name}
							id={filament.slug ?? filament.id} hoverColor="blue" showLogo={false}
							badge={filament.discontinued ? { text: 'Discontinued', color: 'red' } : undefined}
							hasLocalChanges={changeProps.hasLocalChanges} localChangeType={changeProps.localChangeType}
							entityType="filament"
							onCopy={() => filamentCopy.request(filament, filamentPath)}
							onDuplicate={() => filamentDuplicate.request(filament)}
							onPaste={filamentPaste}
							onDelete={() => handleDeleteFilament(filament)}
						/>
					{/each}
				</ChildListPanel>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showEditModal} title="Edit Material" onClose={entityState.closeEdit} maxWidth="5xl" height="3/4">
	{#if material && materialSchema}
		<MaterialForm entity={material} schema={materialSchema}
			config={{ excludeEnumValues: { material: siblingMaterials.filter(m => m.material !== material?.material).map(m => m.material) } }}
			onSubmit={handleSubmit} saving={entityState.saving} />
	{/if}
</Modal>

<DeleteConfirmationModal show={entityState.showDeleteModal} title="Delete Material" entityName={material?.material ?? ''}
	isLocalCreate={entityState.isLocalCreate} deleting={entityState.deleting} onClose={entityState.closeDelete} onDelete={handleDelete}
	cascadeWarning="This will also delete all filaments and variants within this material." />

<!-- Copy/Duplicate options modals (material-level) -->
<DuplicateOptionsModal show={materialCopy.showOptions} onClose={materialCopy.close} onSelect={materialCopy.select} title="Copy Material"
	childrenDescription="Copies all filaments and variants into the clipboard along with the material." />
<DuplicateOptionsModal show={materialDuplicate.showOptions} onClose={materialDuplicate.close} onSelect={materialDuplicate.select} title="Duplicate Material"
	childrenDescription="Copies all filaments and variants under this material into the new duplicate." />

<!-- Copy/Duplicate options modals (filament cards) -->
<DuplicateOptionsModal show={filamentCopy.showOptions} onClose={filamentCopy.close} onSelect={filamentCopy.select} title="Copy Filament"
	childrenDescription="Copies all variants into the clipboard along with the filament." />
<DuplicateOptionsModal show={filamentDuplicate.showOptions} onClose={filamentDuplicate.close} onSelect={filamentDuplicate.select} title="Duplicate Filament"
	childrenDescription="Copies all variants under this filament into the new duplicate." />

<!-- Duplicate/Paste Material Modals -->
<Modal show={entityState.showDuplicateModal} title="Duplicate Material" onClose={entityState.closeDuplicate} maxWidth="5xl" height="3/4">
	{#if duplicateMaterialError}<MessageBanner type="error" message={duplicateMaterialError} />{/if}
	{#if entityState.duplicateData && materialSchema}
		<MaterialForm entity={entityState.duplicateData} schema={materialSchema}
			config={{ excludeEnumValues: { material: siblingMaterials.map(m => m.material) } }}
			onSubmit={handleDuplicateMaterialSubmit} saving={entityState.creating} />
	{/if}
</Modal>
<Modal show={entityState.showPasteModal} title="Paste Material" onClose={entityState.closePaste} maxWidth="5xl" height="3/4">
	{#if duplicateMaterialError}<MessageBanner type="error" message={duplicateMaterialError} />{/if}
	{#if entityState.pasteData && materialSchema}
		<MaterialForm entity={entityState.pasteData} schema={materialSchema}
			config={{ excludeEnumValues: { material: siblingMaterials.map(m => m.material) } }}
			onSubmit={handleDuplicateMaterialSubmit} saving={entityState.creating} />
	{/if}
</Modal>

<CloudCompareModal show={entityState.showCloudCompareModal} onClose={entityState.closeCloudCompare}
	title="Compare Material with Cloud" currentData={material} apiPath="/api/brands/{brandId}/materials/{materialType}" />

<Modal show={entityState.showCreateModal} title="Create New Filament"
	onClose={() => { createError = null; entityState.closeCreate(); }} maxWidth="5xl">
	{#if createError}<MessageBanner type="error" message={createError} />{/if}
	<div class="h-[70vh]">
		<FilamentForm filament={prefillFilamentData ?? undefined} onSubmit={handleCreateFilament} saving={entityState.creating} />
	</div>
</Modal>
