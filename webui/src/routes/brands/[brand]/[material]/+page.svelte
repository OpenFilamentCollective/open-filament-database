<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Material, Filament } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { MaterialForm, FilamentForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, generateMaterialType } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let material: Material | null = $state(null);
	let originalMaterial: Material | null = $state(null);
	let filaments: Filament[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			material
				? `brands/${brandId}/materials/${material.materialType ?? materialType}`
				: null,
		getEntity: () => material
	});

	onMount(async () => {
		try {
			const [materialData, filamentsData] = await Promise.all([
				db.getMaterial(brandId, materialType),
				db.loadFilaments(brandId, materialType)
			]);

			if (!materialData) {
				error = 'Material not found';
				loading = false;
				return;
			}

			material = materialData;
			const trueOriginal = db.getOriginalMaterial(brandId, materialType);
			originalMaterial = trueOriginal ? structuredClone(trueOriginal) : structuredClone(materialData);
			filaments = filamentsData;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load material';
		} finally {
			loading = false;
		}
	});

	async function handleSubmit(data: any) {
		if (!material) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
			const newMaterialType = generateMaterialType(data.material);

			const updatedMaterial: Material = {
				...material,
				...data,
				id: newMaterialType,
				materialType: newMaterialType
			};

			if (!('material_class' in data)) {
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
				setTimeout(() => {
					window.location.href = `/brands/${brandId}`;
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

	async function handleCreateFilament(data: any) {
		entityState.creating = true;
		messageHandler.clear();

		try {
			const result = await db.createFilament(brandId, materialType, data);

			if (result.success && result.filamentId) {
				messageHandler.showSuccess('Filament created successfully!');
				entityState.closeCreate();
				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create filament');
		} finally {
			entityState.creating = false;
		}
	}

	const SLICER_LABELS: Record<string, string> = {
		prusaslicer: 'PrusaSlicer',
		bambustudio: 'Bambu Studio',
		orcaslicer: 'Orca Slicer',
		cura: 'Cura',
		generic: 'Generic'
	};
</script>

{#snippet slicerSettingsRender(settings: Record<string, any>)}
	<div class="space-y-2">
		{#each Object.entries(settings) as [slicerKey, slicerSettings]}
			<div class="bg-muted/50 rounded p-2">
				<div class="font-medium text-sm">{SLICER_LABELS[slicerKey] || slicerKey}</div>
				<div class="text-xs text-muted-foreground mt-1 space-y-0.5">
					{#each Object.entries(slicerSettings as Record<string, any>) as [key, value]}
						{#if value !== undefined && value !== null && value !== ''}
							<div>
								<span class="font-medium">{key}:</span>
								{typeof value === 'object' ? JSON.stringify(value) : value}
							</div>
						{/if}
					{/each}
				</div>
			</div>
		{/each}
	</div>
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

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Filaments</h2>
						<button
							onclick={entityState.openCreate}
							class="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-1"
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
							Add Filament
						</button>
					</div>

					{#if filaments.length === 0}
						<p class="text-muted-foreground">No filaments found for this material.</p>
					{:else}
						<div class="space-y-2">
							{#each filaments as filament}
								{@const filamentHref = `/brands/${brandId}/${materialType}/${filament.slug ?? filament.id}`}
								{@const filamentPath = `brands/${brandId}/materials/${materialType}/filaments/${filament.id}`}
								{@const filamentChange = $isCloudMode
									? $changeStore.changes[filamentPath]
									: undefined}
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
									hasLocalChanges={!!filamentChange}
									localChangeType={filamentChange?.operation}
								/>
							{/each}
						</div>
					{/if}
				</div>
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
	{#if material}
		<MaterialForm {material} onSubmit={handleSubmit} saving={entityState.saving} />
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
	onClose={entityState.closeCreate}
	maxWidth="5xl"
>
	<div class="h-[70vh]">
		<FilamentForm onSubmit={handleCreateFilament} saving={entityState.creating} />
	</div>
</Modal>
