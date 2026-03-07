<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Material, Filament } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { MaterialForm, FilamentForm } from '$lib/components/forms';
	import { fetchEntitySchema } from '$lib/services/schemaService';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard, SlicerSettingsDisplay, ChildListPanel } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { untrack } from 'svelte';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';

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

	let displayFilaments = $derived.by(() => withDeletedStubs({
		changes: $changes,
		useChangeTracking: $useChangeTracking,
		parentPath: `brands/${brandId}/materials/${materialType}`,
		namespace: 'filaments',
		items: filaments,
		getKeys: (f) => [f.id, (f as any).slug],
		buildStub: (id, name) => ({ id, slug: id, name } as unknown as Filament)
	}));

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			material
				? `brands/${brandId}/materials/${material.materialType ?? materialType}`
				: null,
		getEntity: () => material
	});

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

			const updatedMaterial: Material = {
				...(originalMaterial ?? material),
				...data,
				id: existingType,
				materialType: existingType
			};

			// Handle material_class: strip if not in form data, or if the original
			// didn't have it and the value is just the schema default ("FFF").
			// This prevents phantom changes when the form injects schema defaults.
			const orig = originalMaterial ?? material;
			if (!('material_class' in data)) {
				delete (updatedMaterial as any).material_class;
			} else if (orig && !('material_class' in (orig as Record<string, any>)) && data.material_class === 'FFF') {
				delete (updatedMaterial as any).material_class;
			}

			const success = await db.saveMaterial(
				brandId,
				materialType,
				updatedMaterial,
				originalMaterial ?? material
			);

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
			const result = await deleteEntity(
				`brands/${brandId}/materials/${materialType}`,
				'Material',
				() => db.deleteMaterial(brandId, materialType, material!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				entityState.deleting = false;
				setTimeout(() => {
					goto(`/brands/${brandId}`);
				}, 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete material');
			entityState.deleting = false;
		}
	}

	function openCreateFilamentModal() {
		createError = null;
		entityState.openCreate();
	}

	async function handleCreateFilament(data: any) {
		entityState.creating = true;
		createError = null;

		try {
			// Check for duplicate filament
			const filamentSlug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
			const duplicate = filaments.find((f) => (f.slug ?? f.id).toLowerCase() === filamentSlug);
			if (duplicate) {
				createError = `Filament "${data.name}" already exists in this material`;
				entityState.creating = false;
				return;
			}

			const result = await db.createFilament(brandId, materialType, data);

			if (result.success && result.filamentId) {
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
				<p class="text-muted-foreground">
					ID: {String(materialData.materialType ?? materialType).toUpperCase()}
				</p>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityDetails
					entity={materialData}
					title="Material Details"
					fields={[
						{ key: 'material', label: 'Material Type' },
						{ key: 'material_class', label: 'Material Class', hide: (v) => !v },
						{
							key: 'default_max_dry_temperature',
							label: 'Max Dry Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						},
						{
							key: 'default_slicer_settings',
							label: 'Default Slicer Settings',
							hide: (v) => !v || Object.keys(v).length === 0,
							customRender: slicerSettingsRender
						}
					]}
				>
					{#snippet actions()}
						<ActionButtons onEdit={entityState.openEdit} onDelete={entityState.openDelete} />
					{/snippet}
				</EntityDetails>

				<ChildListPanel
					title="Filaments"
					addLabel="Add Filament"
					onAdd={openCreateFilamentModal}
					itemCount={displayFilaments.length}
					emptyMessage="No filaments found for this material."
				>
					{#each displayFilaments as filament}
						{@const filamentHref = `/brands/${brandId}/${materialType}/${filament.slug ?? filament.id}`}
						{@const filamentPath = `brands/${brandId}/materials/${materialType}/filaments/${filament.slug ?? filament.id}`}
						{@const changeProps = getChildChangeProps($changes, $useChangeTracking, filamentPath)}
						<EntityCard
							entity={filament}
							href={filamentHref}
							name={filament.name}
							id={filament.slug ?? filament.id}
							hoverColor="blue"
							showLogo={false}
							badge={filament.discontinued
								? { text: 'Discontinued', color: 'red' }
								: undefined}
							hasLocalChanges={changeProps.hasLocalChanges}
							localChangeType={changeProps.localChangeType}
						/>
					{/each}
				</ChildListPanel>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal
	show={entityState.showEditModal}
	title="Edit Material"
	onClose={entityState.closeEdit}
	maxWidth="5xl"
	height="3/4"
>
	{#if material && materialSchema}
		<MaterialForm
			entity={material}
			schema={materialSchema}
			config={{ excludeEnumValues: { material: siblingMaterials.filter(m => m.material !== material?.material).map(m => m.material) } }}
			onSubmit={handleSubmit}
			saving={entityState.saving}
		/>
	{/if}
</Modal>

<DeleteConfirmationModal
	show={entityState.showDeleteModal}
	title="Delete Material"
	entityName={material?.material ?? ''}
	isLocalCreate={entityState.isLocalCreate}
	deleting={entityState.deleting}
	onClose={entityState.closeDelete}
	onDelete={handleDelete}
	cascadeWarning="This will also delete all filaments and variants within this material."
/>

<Modal
	show={entityState.showCreateModal}
	title="Create New Filament"
	onClose={() => { createError = null; entityState.closeCreate(); }}
	maxWidth="5xl"
>
	{#if createError}
		<MessageBanner type="error" message={createError} />
	{/if}
	<div class="h-[70vh]">
		<FilamentForm onSubmit={handleCreateFilament} saving={entityState.creating} />
	</div>
</Modal>
