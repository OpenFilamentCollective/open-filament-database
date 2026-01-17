<script lang="ts">
	import { page } from '$app/stores';
	import type { Variant } from '$lib/types/database';
	import { Modal, MessageBanner } from '$lib/components/ui';
	import { VariantForm } from '$lib/components/forms';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { db } from '$lib/services/database';
	import { isCloudMode } from '$lib/stores/environment';
	import { changeStore } from '$lib/stores/changes';
	import { getTraitLabel } from '$lib/config/traitConfig';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let variantSlug: string = $derived($page.params.variant!);
	let variant: Variant | null = $state(null);
	let originalVariant: Variant | null = $state(null); // Keep original for revert detection
	let loading: boolean = $state(true);
	let saving: boolean = $state(false);
	let error: string | null = $state(null);

	let showEditModal: boolean = $state(false);
	let showDeleteModal: boolean = $state(false);
	let deleting: boolean = $state(false);

	// Create message handler
	const messageHandler = createMessageHandler();

	// Check if this variant has local changes
	let hasLocalChanges = $derived.by(() => {
		if (!$isCloudMode || !variant) return false;

		// Use variant.slug for the entity path
		const entityPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variant.slug}`;
		const change = $changeStore.changes[entityPath];

		return change && (change.operation === 'create' || change.operation === 'update');
	});

	// Load data when route parameters change
	$effect(() => {
		// Track all route parameters to reload when any change
		const params = { brandId, materialType, filamentId, variantSlug };

		loading = true;
		error = null;
		showEditModal = false; // Close edit modal when navigating

		(async () => {
			try {
				// Use DatabaseService for variant to apply pending changes
				const variantData = await db.getVariant(params.brandId, params.materialType, params.filamentId, params.variantSlug);

				if (!variantData) {
					error = 'Variant not found';
					loading = false;
					return;
				}

				variant = variantData;
				originalVariant = structuredClone(variantData); // Deep clone for revert detection
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
			// Merge with original variant to preserve fields not in the form (like filament_id)
			// Form data takes precedence for fields it manages
			const updatedVariant = {
				...variant,
				...data,
				id: variant.id,
				slug: variant.slug ?? variantSlug
			};

			// Pass the original variant data so change tracking can detect reverts
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
				showEditModal = false;
			} else {
				messageHandler.showError('Failed to save variant');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save variant');
		} finally {
			saving = false;
		}
	}

	function openEditModal() {
		if (variant) {
			showEditModal = true;
		}
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

	// Get active traits as array
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
				<p class="text-muted-foreground">Variant ID: {variantData.id}</p>
			</header>

			{#if hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{/if}

			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="bg-card border border-border rounded-lg p-6">
				<div class="flex justify-between items-center mb-4">
					<h2 class="text-xl font-semibold">Variant Details</h2>
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
																{link.store_id}
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

<Modal show={showDeleteModal} title="Delete Variant" onClose={closeDeleteModal} maxWidth="md">
	{#if variant}
		<div class="space-y-4">
			<p class="text-foreground">
				Are you sure you want to delete the variant <strong>{variant.color_name}</strong>?
			</p>

			{#if $isCloudMode}
				<div class="bg-primary/10 border border-primary/20 rounded p-3">
					<p class="text-sm text-primary">
						{#if $changeStore.changes[`brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variantSlug}`]?.operation === 'create'}
							This will remove the locally created variant. The change will be discarded.
						{:else}
							This will mark the variant for deletion. Remember to export your changes.
						{/if}
					</p>
				</div>
			{:else}
				<div class="bg-destructive/10 border border-destructive/20 rounded p-3">
					<p class="text-sm text-destructive">
						This action cannot be undone. The variant will be permanently deleted.
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
					{deleting ? 'Deleting...' : 'Delete Variant'}
				</button>
			</div>
		</div>
	{/if}
</Modal>

<Modal show={showEditModal} title="Edit Variant" onClose={closeEditModal} maxWidth="5xl">
	{#if variant}
		<div class="h-[70vh]">
			<VariantForm variant={variant} onSubmit={handleSubmit} {saving} />
		</div>
	{:else}
		<div class="flex justify-center items-center py-12">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
		</div>
	{/if}
</Modal>
