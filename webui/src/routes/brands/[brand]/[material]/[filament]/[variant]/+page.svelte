<script lang="ts">
	import { page } from '$app/stores';
	import type { Variant } from '$lib/types/database';
	import { createForm, BasicForm } from '@sjsf/form';
	import { formDefaults } from '$lib/utils/formDefaults';
	import { createUiSchema, removeIdFromSchema, applyFormattedTitles } from '$lib/utils/schemaUtils';
	import { customTranslation } from '$lib/utils/translations';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { EntityFormWrapper } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { apiFetch } from '$lib/utils/api';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';
	import '@sjsf/basic-theme/css/basic.css';
	import '$lib/styles/sjsf-buttons.css';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let variantSlug: string = $derived($page.params.variant!);
	let variant: Variant | null = $state(null);
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
		const params = { brandId, materialType, filamentId, variantSlug };

		loading = true;
		error = null;
		editMode = false; // Exit edit mode when navigating

		(async () => {
			try {
				// Use DatabaseService for variant to apply pending changes
				const [variantData, schemaData] = await Promise.all([
					db.getVariant(params.brandId, params.materialType, params.filamentId, params.variantSlug),
					apiFetch('/api/schemas/variant').then((r) => r.json())
				]);

				if (!variantData) {
					error = 'Variant not found';
					loading = false;
					return;
				}

				variant = variantData;
				schema = schemaData;
				formData = { ...variantData };
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load variant';
			} finally {
				loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!variant) return;

		saving = true;
		messageHandler.clear();

		try {
			// Preserve id and slug from original variant since form doesn't include them
			const updatedVariant = {
				...data,
				id: variant.id,
				slug: variant.slug ?? variantSlug
			};

			// Use DatabaseService for saving (handles cloud vs local mode)
			const success = await db.saveVariant(
				brandId,
				materialType,
				filamentId,
				variantSlug,
				updatedVariant,
				variant
			);

			if (success) {
				variant = updatedVariant;
				formData = { ...updatedVariant };
				messageHandler.showSuccess('Variant saved successfully!');
				editMode = false;
			} else {
				messageHandler.showError('Failed to save variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save variant');
		} finally {
			saving = false;
		}
	}

	function toggleEditMode() {
		editMode = !editMode;
		if (editMode && variant && schema) {
			formData = { ...variant };
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
		if (variant) {
			formData = { ...variant };
		}
	}

	function openDeleteModal() {
		showDeleteModal = true;
	}

	function closeDeleteModal() {
		showDeleteModal = false;
	}

	async function handleDelete() {
		if (!variant) return;

		deleting = true;
		messageHandler.clear();

		try {
			if ($isCloudMode) {
				const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`;
				const change = $changeStore.changes[entityPath];

				if (change && change.operation === 'create') {
					changeStore.removeChange(entityPath);
					messageHandler.showSuccess('Local variant creation removed');
				} else {
					await db.deleteVariant(brandId, materialType, filamentId, variantSlug, variant);
					messageHandler.showSuccess('Variant marked for deletion - export to save');
				}
			} else {
				const success = await db.deleteVariant(brandId, materialType, filamentId, variantSlug, variant);
				if (success) {
					messageHandler.showSuccess('Variant deleted successfully');
				} else {
					messageHandler.showError('Failed to delete variant');
					deleting = false;
					showDeleteModal = false;
					return;
				}
			}

			showDeleteModal = false;
			setTimeout(() => {
				window.location.href = `/brands/${brandId}/${materialType}/${filamentId}`;
			}, 1500);
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete variant');
			deleting = false;
			showDeleteModal = false;
		}
	}
</script>

<svelte:head>
	<title>{variant ? `${variant.color_name}` : 'Variant Not Found'}</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-6">
		<BackButton href="/brands/{brandId}/{materialType}/{filamentId}" label="Filament" />
	</div>

	<DataDisplay {loading} {error} data={variant}>
		{#snippet children(variantData)}
			<header class="mb-6">
				<div class="flex items-center gap-3 mb-2">
					<div
						class="w-12 h-12 rounded-full border-2 border-gray-300"
						style="background-color: {variantData.color_hex}"
						title={variantData.color_hex}
					></div>
					<div>
						<h1 class="text-3xl font-bold">{variantData.color_name}</h1>
						{#if variantData.discontinued}
							<span class="px-3 py-1 text-sm bg-red-100 text-red-800 rounded-full"
								>Discontinued</span
							>
						{/if}
					</div>
				</div>
				<p class="text-gray-600">Variant ID: {variantData.id}</p>
			</header>

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<EntityFormWrapper
				title="Variant Details"
				{editMode}
				{saving}
				{form}
				onEdit={toggleEditMode}
				onCancel={cancelEdit}
				onDelete={openDeleteModal}
				editButtonClass="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
			>
				{#snippet children()}
					<dl class="space-y-4">
						<div>
							<dt class="text-sm font-medium text-gray-500">Color Name</dt>
							<dd class="mt-1 text-lg">{variantData.color_name}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-gray-500">Slug</dt>
							<dd class="mt-1">{variantData.slug}</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-gray-500">Color</dt>
							<dd class="mt-1 flex items-center gap-2">
								<div
									class="w-8 h-8 rounded border-2 border-gray-300"
									style="background-color: {variantData.color_hex}"
								></div>
								<span class="font-mono">{variantData.color_hex}</span>
							</dd>
						</div>
						<div>
							<dt class="text-sm font-medium text-gray-500">Status</dt>
							<dd class="mt-1">
								{variantData.discontinued ? 'Discontinued' : 'Active'}
							</dd>
						</div>
					</dl>
				{/snippet}
			</EntityFormWrapper>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={showDeleteModal} title="Delete Variant" onClose={closeDeleteModal} maxWidth="md">
	{#if variant}
		<div class="space-y-4">
			<p class="text-gray-700">
				Are you sure you want to delete the variant <strong>{variant.color_name}</strong>?
			</p>

			{#if $isCloudMode}
				<div class="bg-blue-50 border border-blue-200 rounded p-3">
					<p class="text-sm text-blue-800">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`]?.operation === 'create'}
							This will remove the locally created variant. The change will be discarded.
						{:else}
							This will mark the variant for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-red-50 border border-red-200 rounded p-3">
					<p class="text-sm text-red-800">
						This action cannot be undone. The variant will be permanently deleted.
					</p>
				</div>
			{/if}

			<div class="flex justify-end gap-2 pt-4">
				<button
					onclick={closeDeleteModal}
					disabled={deleting}
					class="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 transition-colors disabled:opacity-50"
				>
					Cancel
				</button>
				<button
					onclick={handleDelete}
					disabled={deleting}
					class="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50"
				>
					{deleting ? 'Deleting...' : 'Delete Variant'}
				</button>
			</div>
		</div>
	{/if}
</Modal>
