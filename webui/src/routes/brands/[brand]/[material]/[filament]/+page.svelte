<script lang="ts">
	import { page } from '$app/stores';
	import type { Filament, Variant } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { EntityFormWrapper } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { EntityCard } from '$lib/components/entity';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filament: Filament | null = $state(null);
	let variants: Variant[] = $state([]);
	let schema: any = $state(null);
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let editMode: boolean = $state(false);
	let formData: any = $state({});
	let form: any = $state(null);

	let showDeleteModal: boolean = $state(false);
	let deleting: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Load data when route parameters change
	$effect(() => {
		// Track all route parameters to reload when any change
		const params = { brandId, materialType, filamentId };

		loading = true;
		error = null;
		editMode = false; // Exit edit mode when navigating

		(async () => {
			try {
				// Use DatabaseService for filament and variants to apply pending changes
				const [filamentData, variantsData, schemaData] = await Promise.all([
					db.getFilament(params.brandId, params.materialType, params.filamentId),
					db.loadVariants(params.brandId, params.materialType, params.filamentId),
					apiFetch('/api/schemas/filament').then((r) => r.json())
				]);

				if (!filamentData) {
					error = 'Filament not found';
					loading = false;
					return;
				}

				filament = filamentData;
				variants = variantsData || [];
				schema = schemaData;
				formData = { ...filamentData };
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load filament';
			} finally {
				loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!filament) return;

		saving = true;
		messageHandler.clear();

		try {
			// Preserve id and slug from original filament since form doesn't include them
			const updatedFilament = {
				...data,
				id: filament.id,
				slug: filament.slug ?? filament.id
			};

			// Use DatabaseService for saving (handles cloud vs local mode)
			const success = await db.saveFilament(brandId, materialType, filamentId, updatedFilament, filament);

			if (success) {
				filament = updatedFilament;
				formData = { ...updatedFilament };
				messageHandler.showSuccess('Filament saved successfully!');
				editMode = false;
			} else {
				messageHandler.showError('Failed to save filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save filament');
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && filament && schema) {
			formData = { ...filament };
			let editSchema = removeIdFromSchema(schema);
			editSchema = applyFormattedTitles(editSchema);
			form = createForm({
				...formDefaults,
				schema: editSchema,
				uiSchema: createUiSchema(),
				translation: customTranslation,
				initialValue: formData,
				onSubmit: handleSubmit
			});
		}
	}

	function cancelEdit() {
		editMode = false;
		if (filament) {
			formData = { ...filament };
		}
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!filament) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local filament creation removed');
				} else {
					await db.deleteFilament(brandId, materialType, filamentId, filament);
					messageHandler.showSuccess('Filament marked for deletion - export to save');
				}
			} else {
				const success = await db.deleteFilament(brandId, materialType, filamentId, filament);
				if (success) {
					messageHandler.showSuccess('Filament deleted successfully');
				} else {
					messageHandler.showError('Failed to delete filament');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = `/brands/${brandId}/${materialType}`;
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete filament');
			deleting = false;
			showDeleteModal = false;
		}
	}
</script>

<svelte:head>
	<title>{filament ? `${filament.name}` : 'Filament Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-6xl">
	<div class="mb-6">
		<BackButton href="/brands/{brandId}/{materialType}" label="Material" />
	</div>

	<DataDisplay {loading} {error} data={filament}>
		{#snippet children(filamentData)}
			<header class="mb-6">
				<div class="flex items-center gap-3 mb-2">
					<h1 class="text-3xl font-bold">{filamentData.name}</h1>
					{#if filamentData.discontinued}
						<span class="px-3 py-1 text-sm bg-destructive/10 text-destructive rounded-full"
							>Discontinued</span
						>
					{/if}
				</div>
				<p class="text-muted-foreground">Filament ID: {filamentData.id}</p>
			</header>

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityFormWrapper
					title="Filament Details"
					{editMode}
					{saving}
					{form}
					onEdit={toggleEditMode}
					onCancel={cancelEdit}
					onDelete={openDeleteModal}
				>
					{#snippet children()}
						<dl class="space-y-4">
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Name</dt>
									<dd class="mt-1 text-lg">{filamentData.name}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Density</dt>
									<dd class="mt-1">{filamentData.density} g/cm³</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Diameter Tolerance</dt>
									<dd class="mt-1">{filamentData.diameter_tolerance} mm</dd>
								</div>
								{#if filamentData.min_print_temperature}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Print Temperature Range</dt>
										<dd class="mt-1">
											{filamentData.min_print_temperature}°C - {filamentData.max_print_temperature}°C
										</dd>
									</div>
								{/if}
								{#if filamentData.min_bed_temperature}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Bed Temperature Range</dt>
										<dd class="mt-1">
											{filamentData.min_bed_temperature}°C - {filamentData.max_bed_temperature}°C
										</dd>
									</div>
								{/if}
								{#if filamentData.preheat_temperature}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Preheat Temperature</dt>
										<dd class="mt-1">{filamentData.preheat_temperature}°C</dd>
									</div>
								{/if}
								{#if filamentData.shore_hardness_a}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Shore Hardness A</dt>
										<dd class="mt-1">{filamentData.shore_hardness_a}</dd>
									</div>
								{/if}
								{#if filamentData.shore_hardness_d}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Shore Hardness D</dt>
										<dd class="mt-1">{filamentData.shore_hardness_d}</dd>
									</div>
								{/if}
								{#if filamentData.max_dry_temperature}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Max Dry Temperature</dt>
										<dd class="mt-1">{filamentData.max_dry_temperature}°C</dd>
									</div>
								{/if}
								{#if filamentData.min_nozzle_diameter}
									<div>
										<dt class="text-sm font-medium text-muted-foreground">Min Nozzle Diameter</dt>
										<dd class="mt-1">{filamentData.min_nozzle_diameter} mm</dd>
									</div>
								{/if}
							</div>

							{#if filamentData.certifications && filamentData.certifications.length > 0}
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Certifications</dt>
									<dd class="mt-1">
										<div class="flex flex-wrap gap-2">
											{#each filamentData.certifications as cert}
												<span class="px-2 py-1 bg-primary/10 text-primary rounded text-sm"
													>{cert}</span
												>
											{/each}
										</div>
									</dd>
								</div>
							{/if}

							{#if filamentData.data_sheet_url}
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Data Sheet</dt>
									<dd class="mt-1">
										<a
											href={filamentData.data_sheet_url}
											target="_blank"
											class="text-primary hover:underline"
										>
											{filamentData.data_sheet_url}
										</a>
									</dd>
								</div>
							{/if}

							{#if filamentData.safety_sheet_url}
								<div>
									<dt class="text-sm font-medium text-muted-foreground">Safety Sheet</dt>
									<dd class="mt-1">
										<a
											href={filamentData.safety_sheet_url}
											target="_blank"
											class="text-primary hover:underline"
										>
											{filamentData.safety_sheet_url}
										</a>
									</dd>
								</div>
							{/if}
						</dl>
					{/snippet}
				</EntityFormWrapper>

				<div class="bg-card border border-border rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Variants</h2>
						<a
							href="/brands/{brandId}/{materialType}/{filamentId}/new"
							class="bg-orange-500 text-white hover:bg-orange-600 px-4 py-2 rounded-md font-medium text-sm flex items-center gap-1"
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
							Add Variant
						</a>
					</div>

					{#if variants.length === 0}
						<p class="text-muted-foreground">No variants found for this filament.</p>
					{:else}
						<div class="space-y-2">
							{#each variants as variant}
								<EntityCard
									entity={variant}
									name={variant.color_name}
									id={variant.slug}
									href="/brands/{brandId}/{materialType}/{filamentId}/{variant.slug}"
									colorHex={variant.color_hex}
									hoverColor="orange"
									showLogo={false}
									badge={variant.discontinued ? { text: 'Discontinued', color: 'red' } : undefined}
								/>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showDeleteModal} title="Delete Filament" onClose={closeDeleteModal} maxWidth="md">
	{#if filament}
		<div class="space-y-4">
			<p class="text-foreground">
				Are you sure you want to delete the filament <strong>{filament.name}</strong>?
			</p>
			<p class="text-muted-foreground text-sm">
				This will also delete all variants within this filament.
			</p>

			{#if $isCloudMode}
				<div class="bg-primary/10 border border-primary/20 rounded p-3">
					<p class="text-sm text-primary">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`]?.operation === 'create'}
							This will remove the locally created filament. The change will be discarded.
						{:else}
							This will mark the filament for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
					<p class="text-sm text-destructive">
						This action cannot be undone. The filament and all its variants will be permanently deleted.
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
					{deleting ? 'Deleting...' : 'Delete Filament'}
				</button>
			</div>
		</div>
	{/if}
</Modal>
