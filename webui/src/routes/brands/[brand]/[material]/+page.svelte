<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Material, Filament } from '$lib/types/database';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { MaterialForm, FilamentForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityDetails, EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let material: Material | null = $state(null);
	let originalMaterial: Material | null = $state(null); // Keep original for revert detection
	let filaments: Filament[] = $state([]);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let showCreateFilamentModal: boolean = $state(false);
	let deleting: boolean = $state(false);
	let creatingFilament: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Check if this material has local changes
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !material) return false;

		// For materials, the entity path uses materialType
		const entityPath = `brands/${brandId}/materials/${material.materialType ?? materialType}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
	});

	onMount(async () => {
		try {
			// Use DatabaseService for material and filaments to apply pending changes
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
			// For revert detection, use the true original data if there are pending changes
			// Otherwise use the current data (which is the API data when no changes exist)
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

		saving = true;
		messageHandler.clear();

		try {
			// Derive materialType from the material name, preserving uppercase (e.g., "PLA" -> "PLA")
			// This ensures the ID always matches the material name with uppercase letters
			const newMaterialType = data.material.toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '');

			// Merge form data with existing material to preserve fields the form doesn't manage
			const updatedMaterial = {
				...material,
				...data,
				id: newMaterialType,
				materialType: newMaterialType
			};

			// If material_class is not in the form data (set to "Not set"), remove it
			// This handles the case where the user explicitly clears the value
			if (!('material_class' in data)) {
				delete updatedMaterial.material_class;
			}

			// Pass the original material data so change tracking can detect reverts
			const success = await db.saveMaterial(brandId, materialType, updatedMaterial, originalMaterial ?? material);

			if (success) {
				material = updatedMaterial;
				messageHandler.showSuccess('Material saved successfully!');
				showEditModal = false;
			} else {
				messageHandler.showError('Failed to save material');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save material');
		} finally {
			saving = false;
		}
	}

	function openEditModal() {
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!material) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				const entityPath = `brands/${brandId}/materials/${materialType}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local material creation removed');
				} else {
					await db.deleteMaterial(brandId, materialType, material);
					messageHandler.showSuccess('Material marked for deletion - export to save');
				}
			} else {
				const success = await db.deleteMaterial(brandId, materialType, material);
				if (success) {
					messageHandler.showSuccess('Material deleted successfully');
				} else {
					messageHandler.showError('Failed to delete material');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = `/brands/${brandId}`;
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete material');
			deleting = false;
			showDeleteModal = false;
		}
	}

	function openCreateFilamentModal() {
		showCreateFilamentModal = true;
	}

	function closeCreateFilamentModal() {
		showCreateFilamentModal = false;
	}

	async function handleCreateFilament(data: any) {
		creatingFilament = true;
		messageHandler.clear();

		try {
			const result = await db.createFilament(brandId, materialType, data);

			if (result.success && result.filamentId) {
				messageHandler.showSuccess('Filament created successfully!');
				showCreateFilamentModal = false;

				setTimeout(() => {
					window.location.reload();
				}, 500);
			} else {
				messageHandler.showError('Failed to create filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to create filament');
		} finally {
			creatingFilament = false;
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
							<div><span class="font-medium">{key}:</span> {typeof value === 'object' ? JSON.stringify(value) : value}</div>
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
					Material ID: {materialData.materialType ?? materialType}
				</p>
			</header>

			{#if hasLocalChanges}
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
						{
							key: 'material',
							label: 'Material Type'
						},
						{
							key: 'material_class',
							label: 'Material Class',
							hide: (v) => !v
						},
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
						<div class="flex gap-2">
							<button
								onclick={openEditModal}
								class="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-md font-medium"
							>
								Edit
							</button>
							<button
								onclick={openDeleteModal}
								class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium"
							>
								Delete
							</button>
						</div>
					{/snippet}
				</EntityDetails>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Filaments</h2>
						<button
							onclick={openCreateFilamentModal}
							class="bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-1"
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
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
								{@const filamentChange = $isCloudMode ? $changeStore.changes[filamentPath] : undefined}
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

<Modal show={showEditModal} title="Edit Material" onClose={closeEditModal} maxWidth="5xl" height="3/4">
	{#if material}
		<MaterialForm
			{material}
			onSubmit={handleSubmit}
			{saving}
		/>
	{/if}
</Modal>

<Modal show={showDeleteModal} title="Delete Material" onClose={closeDeleteModal} maxWidth="md">
	{#if material}
		<div class="space-y-4">
			<p class="text-foreground">
				Are you sure you want to delete the material <strong>{material.material}</strong>?
			</p>
			<p class="text-muted-foreground text-sm">
				This will also delete all filaments and variants within this material.
			</p>

			{#if $isCloudMode}
				<div class="bg-primary/10 border border-primary/20 rounded p-3">
					<p class="text-sm text-primary">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}`]?.operation === 'create'}
							This will remove the locally created material. The change will be discarded.
						{:else}
							This will mark the material for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
					<p class="text-sm text-destructive">
						This action cannot be undone. The material and all its contents will be permanently deleted.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<button
					onclick={closeDeleteModal}
					disabled={deleting}
					class="bg-muted text-muted-foreground hover:bg-muted/80 px-4 py-2 rounded-md font-medium disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={handleDelete}
					disabled={deleting}
					class="bg-destructive text-destructive-foreground hover:bg-destructive/90 px-4 py-2 rounded-md font-medium disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Delete Material'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

<Modal show={showCreateFilamentModal} title="Create New Filament" onClose={closeCreateFilamentModal} maxWidth="5xl">
	<div class="h-[70vh]">
		<FilamentForm onSubmit={handleCreateFilament} saving={creatingFilament} />
	</div>
</Modal>
