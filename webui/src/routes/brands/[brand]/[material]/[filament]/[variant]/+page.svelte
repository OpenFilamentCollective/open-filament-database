<script lang="ts">
	import { page } from '$app/stores';
	import type { Variant, Store } from '$lib/types/database';
	import { Modal, MessageBanner, DeleteConfirmationModal, ActionButtons } from '$lib/components/ui';
	import { VariantForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { deleteEntity, mergeEntityData } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { getTraitLabel } from '$lib/config/traitConfig';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let variantSlug: string = $derived($page.params.variant!);
	let variant: Variant | null = $state(null);
	let originalVariant: Variant | null = $state(null);
	let stores: Store[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);

	function getStoreName(storeId: string): string {
		const store = stores.find((s) => s.id === storeId);
		return store?.name || storeId;
	}

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			variant
				? `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variant.slug}`
				: null,
		getEntity: () => variant
	});

	// Load data when route parameters change
	$effect(() => {
		const params = { brandId, materialType, filamentId, variantSlug };

		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
				const [variantData, storesData] = await Promise.all([
					db.getVariant(params.brandId, params.materialType, params.filamentId, params.variantSlug),
					db.loadStores()
				]);

				if (!variantData) {
					error = 'Variant not found';
					loading = false;
					return;
				}

				variant = variantData;
				originalVariant = structuredClone(variantData);
				stores = storesData;
			} catch (e) {
				error = e instanceof Error ? e.message : 'Failed to load variant';
			} finally {
				loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!variant) return;

		entityState.saving = true;
		messageHandler.clear();

		try {
			const updatedVariant = mergeEntityData(variant, data, ['id', 'slug']) as Variant;

			const success = await db.saveVariant(
				brandId,
				materialType,
				filamentId,
				variantSlug,
				updatedVariant,
				originalVariant ?? variant
			);

			if (success) {
				variant = updatedVariant;
				messageHandler.showSuccess('Variant saved successfully!');
				entityState.closeEdit();
			} else {
				messageHandler.showError('Failed to save variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save variant');
		} finally {
			entityState.saving = false;
		}
	}

	async function handleDelete() {
		if (!variant) return;

		entityState.deleting = true;
		messageHandler.clear();

		try {
			const result = await deleteEntity(
				`brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`,
				'Variant',
				() => db.deleteVariant(brandId, materialType, filamentId, variantSlug, variant!)
			);

			if (result.success) {
				messageHandler.showSuccess(result.message);
				entityState.closeDelete();
				setTimeout(() => {
					window.location.href = `/brands/${brandId}/${materialType}/${filamentId}`;
				}, 1500);
			} else {
				messageHandler.showError(result.message);
				entityState.deleting = false;
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to delete variant');
			entityState.deleting = false;
		}
	}

	function getActiveTraits(traits: Record<string, boolean> | undefined): string[] {
		if (!traits) return [];
		return Object.entries(traits)
			.filter(([_, value]) => value === true)
			.map(([key]) => key);
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
						class="w-12 h-12 rounded-full border-2 border-border"
						style="background-color: {variantData.color_hex}"
						title={variantData.color_hex}
					></div>
					<div>
						<h1 class="text-3xl font-bold">{variantData.color_name}</h1>
						{#if variantData.discontinued}
							<span class="px-3 py-1 text-sm bg-destructive/10 text-destructive rounded-full"
								>Discontinued</span
							>
						{/if}
					</div>
				</div>
				{#if $isCloudMode}
					{#if variantData.slug}
						<p class="text-muted-foreground">Native ID: {variantData.slug}</p>
						<p class="text-muted-foreground">Cloud ID: {variantData.id}</p>
					{:else}
						<p class="text-muted-foreground">Native ID: {variantData.id}</p>
					{/if}
				{:else}
					<p class="text-muted-foreground">ID: {variantData.id}</p>
				{/if}
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="bg-card border border-border rounded-lg p-6">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold">Variant Details</h2>
					<ActionButtons onEdit={entityState.openEdit} onDelete={entityState.openDelete} />
				</div>

				<dl class="space-y-4">
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Color Name</dt>
						<dd class="mt-1 text-lg">{variantData.color_name}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Slug</dt>
						<dd class="mt-1">{variantData.slug}</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Color</dt>
						<dd class="mt-1 flex items-center gap-2">
							<div
								class="w-8 h-8 rounded border-2 border-border"
								style="background-color: {variantData.color_hex}"
							></div>
							<span class="font-mono">{variantData.color_hex}</span>
						</dd>
					</div>
					<div>
						<dt class="text-sm font-medium text-muted-foreground">Status</dt>
						<dd class="mt-1">
							{variantData.discontinued ? 'Discontinued' : 'Active'}
						</dd>
					</div>
					{#if getActiveTraits(variantData.traits).length > 0}
						{@const activeTraits = getActiveTraits(variantData.traits)}
						<div>
							<dt class="text-sm font-medium text-muted-foreground mb-2">Traits</dt>
							<dd class="flex flex-wrap gap-1.5">
								{#each activeTraits as trait}
									<span class="px-2 py-1 bg-primary/10 text-primary rounded-full text-sm">
										{getTraitLabel(trait)}
									</span>
								{/each}
							</dd>
						</div>
					{/if}
				</dl>

				{#if variantData.sizes && variantData.sizes.length > 0}
					<div class="mt-6 pt-6 border-t border-border">
						<h3 class="text-lg font-semibold mb-4">Available Sizes ({variantData.sizes.length})</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							{#each variantData.sizes as size, index}
								<div class="bg-muted/50 rounded-lg p-4">
									<div class="flex items-center justify-between mb-2">
										<span class="font-medium">{size.filament_weight}g / {size.diameter}mm</span>
										{#if size.discontinued}
											<span class="px-2 py-0.5 text-xs bg-destructive/10 text-destructive rounded">Discontinued</span>
										{/if}
										{#if size.spool_refill}
											<span class="px-2 py-0.5 text-xs bg-primary/10 text-primary rounded">Refill</span>
										{/if}
									</div>
									<dl class="text-sm space-y-1 text-muted-foreground">
										{#if size.empty_spool_weight}
											<div>Empty spool: {size.empty_spool_weight}g</div>
										{/if}
										{#if size.spool_core_diameter}
											<div>Core diameter: {size.spool_core_diameter}mm</div>
										{/if}
										{#if size.gtin}
											<div>GTIN: {size.gtin}</div>
										{/if}
										{#if size.article_number}
											<div>Article #: {size.article_number}</div>
										{/if}
										{#if size.purchase_links && size.purchase_links.length > 0}
											<div class="mt-2">
												<span class="text-foreground">Purchase links:</span>
												<ul class="list-disc list-inside mt-1">
													{#each size.purchase_links as link}
														<li>
															<a href={link.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
																{getStoreName(link.store_id)}
															</a>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
									</dl>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal show={entityState.showEditModal} title="Edit Variant" onClose={entityState.closeEdit} maxWidth="5xl">
	{#if variant}
		<div class="h-[70vh]">
			<VariantForm {variant} onSubmit={handleSubmit} saving={entityState.saving} />
		</div>
	{/if}
</Modal>

<DeleteConfirmationModal
	show={entityState.showDeleteModal}
	title="Delete Variant"
	entityName={variant?.color_name ?? ''}
	isLocalCreate={entityState.isLocalCreate}
	deleting={entityState.deleting}
	onClose={entityState.closeDelete}
	onDelete={handleDelete}
/>
