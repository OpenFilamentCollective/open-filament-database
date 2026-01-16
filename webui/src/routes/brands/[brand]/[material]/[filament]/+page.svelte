<script lang="ts">
	import { page } from '$app/stores';
	import type { Filament, Variant } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import EntityForm from '$lib/components/EntityForm.svelte';
	import MessageBanner from '$lib/components/MessageBanner.svelte';
	import BackButton from '$lib/components/BackButton.svelte';
	import DataDisplay from '$lib/components/DataDisplay.svelte';
	import EntityCard from '$lib/components/EntityCard.svelte';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

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
						<span class="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full"
							>Discontinued</span
						>
					{/if}
				</div>
				<p class="text-gray-600">Filament ID: {filamentData.id}</p>
			</header>

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
				<EntityForm
					title="Filament Details"
					{editMode}
					{saving}
					{form}
					onEdit={toggleEditMode}
					onCancel={cancelEdit}
				>
					{#snippet children()}
						<dl class="space-y-4">
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<dt class="text-sm font-medium text-gray-500">Name</dt>
									<dd class="mt-1 text-lg">{filamentData.name}</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-gray-500">Density</dt>
									<dd class="mt-1">{filamentData.density} g/cm³</dd>
								</div>
								<div>
									<dt class="text-sm font-medium text-gray-500">Diameter Tolerance</dt>
									<dd class="mt-1">{filamentData.diameter_tolerance} mm</dd>
								</div>
								{#if filamentData.min_print_temperature}
									<div>
										<dt class="text-sm font-medium text-gray-500">Print Temperature Range</dt>
										<dd class="mt-1">
											{filamentData.min_print_temperature}°C - {filamentData.max_print_temperature}°C
										</dd>
									</div>
								{/if}
								{#if filamentData.min_bed_temperature}
									<div>
										<dt class="text-sm font-medium text-gray-500">Bed Temperature Range</dt>
										<dd class="mt-1">
											{filamentData.min_bed_temperature}°C - {filamentData.max_bed_temperature}°C
										</dd>
									</div>
								{/if}
								{#if filamentData.preheat_temperature}
									<div>
										<dt class="text-sm font-medium text-gray-500">Preheat Temperature</dt>
										<dd class="mt-1">{filamentData.preheat_temperature}°C</dd>
									</div>
								{/if}
								{#if filamentData.shore_hardness_a}
									<div>
										<dt class="text-sm font-medium text-gray-500">Shore Hardness A</dt>
										<dd class="mt-1">{filamentData.shore_hardness_a}</dd>
									</div>
								{/if}
								{#if filamentData.shore_hardness_d}
									<div>
										<dt class="text-sm font-medium text-gray-500">Shore Hardness D</dt>
										<dd class="mt-1">{filamentData.shore_hardness_d}</dd>
									</div>
								{/if}
								{#if filamentData.max_dry_temperature}
									<div>
										<dt class="text-sm font-medium text-gray-500">Max Dry Temperature</dt>
										<dd class="mt-1">{filamentData.max_dry_temperature}°C</dd>
									</div>
								{/if}
								{#if filamentData.min_nozzle_diameter}
									<div>
										<dt class="text-sm font-medium text-gray-500">Min Nozzle Diameter</dt>
										<dd class="mt-1">{filamentData.min_nozzle_diameter} mm</dd>
									</div>
								{/if}
							</div>

							{#if filamentData.certifications && filamentData.certifications.length > 0}
								<div>
									<dt class="text-sm font-medium text-gray-500">Certifications</dt>
									<dd class="mt-1">
										<div class="flex flex-wrap gap-2">
											{#each filamentData.certifications as cert}
												<span class="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm"
													>{cert}</span
												>
											{/each}
										</div>
									</dd>
								</div>
							{/if}

							{#if filamentData.data_sheet_url}
								<div>
									<dt class="text-sm font-medium text-gray-500">Data Sheet</dt>
									<dd class="mt-1">
										<a
											href={filamentData.data_sheet_url}
											target="_blank"
											class="text-blue-600 hover:underline"
										>
											{filamentData.data_sheet_url}
										</a>
									</dd>
								</div>
							{/if}

							{#if filamentData.safety_sheet_url}
								<div>
									<dt class="text-sm font-medium text-gray-500">Safety Sheet</dt>
									<dd class="mt-1">
										<a
											href={filamentData.safety_sheet_url}
											target="_blank"
											class="text-blue-600 hover:underline"
										>
											{filamentData.safety_sheet_url}
										</a>
									</dd>
								</div>
							{/if}
						</dl>
					{/snippet}
				</EntityForm>

				<div class="bg-white border border-gray-200 rounded-lg p-6">
					<div class="flex justify-between items-center mb-4">
						<h2 class="text-xl font-semibold">Variants</h2>
						<a
							href="/brands/{brandId}/{materialType}/{filamentId}/new"
							class="bg-orange-600 hover:bg-orange-700 text-white font-semibold px-3 py-1.5 rounded text-sm transition-colors flex items-center gap-1"
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
						<p class="text-gray-500">No variants found for this filament.</p>
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
