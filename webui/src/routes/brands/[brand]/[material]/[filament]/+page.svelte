<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { Filament, Variant } from '$lib/types/database';
	import {
		Modal,
		MessageBanner,
		DeleteEntityModal,
		Button,
		EntityActionDropdown,
		CloudCompareModal,
		DuplicateOptionsModal,
		FixHint
	} from '$lib/components/ui';
	import { BackButton } from '$lib/components/actions';
	import { DataDisplay } from '$lib/components/layout';
	import {
		EntityDetails,
		EntityCard,
		SlicerSettingsDisplay,
		CertificationsDisplay,
		ChildListPanel,
		SubmittedBanner,
		InFlightHint,
		OrcaDownloadButton
	} from '$lib/components/entity';
	import { FilamentForm, VariantForm } from '$lib/components/forms';
	import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
	import { createEntityState } from '$lib/utils/entityState.svelte';
	import { createDeleteFlow } from '$lib/utils/useDeleteFlow.svelte';
	import {
		createCopyAction,
		createDuplicateAction,
		createPasteHandler
	} from '$lib/utils/useEntityActions.svelte';
	import { generateSlug } from '$lib/services/entityService';
	import { db } from '$lib/services/database';
	import { untrack } from 'svelte';
	import { useChangeTracking } from '$lib/stores/environment';
	import { changes } from '$lib/stores/changes';
	import { submittedStore } from '$lib/stores/submitted';
	import { withDeletedStubs, getChildChangeProps } from '$lib/utils/deletedStubs';
	import { getClipboard } from '$lib/services/clipboardService';
	import {
		duplicateFilamentChildren,
		loadFilamentChildren,
		pasteFilamentChildren
	} from '$lib/services/duplicateService';
	import { formDrafts } from '$lib/stores/formDrafts';
	import {
		collectSiblingFibers,
		checkFiberConflict,
		fibersFromTraits
	} from '$lib/utils/fiberConflict';
	import { trueTraitKeys } from '$lib/utils/traitSuggestions';
	import { findSharedPurchaseLinks } from '$lib/utils/dataQuality';
	import { orcaProfileUrl } from '$lib/utils/orcaLinks';

	let brandId: string = $derived($page.params.brand!);
	let materialType: string = $derived($page.params.material!);
	let filamentId: string = $derived($page.params.filament!);
	let filamentEditDraftKey = $derived(`edit:filament:${brandId}:${materialType}:${filamentId}`);
	let variantCreateDraftKey = $derived(`create:variant:${brandId}:${materialType}:${filamentId}`);
	let filamentCreateDraftKey = $derived(`create:filament:${brandId}:${materialType}`);
	let loadGeneration = 0;
	let filament: Filament | null = $state(null);
	let originalFilament: Filament | null = $state(null);
	let variants: Variant[] = $state([]);
	let loading: boolean = $state(true);
	let error: string | null = $state(null);
	let createError: string | null = $state(null);
	let variantSearch: string = $state('');
	let duplicateFilamentError: string | null = $state(null);
	let prefillVariantData: Variant | null = $state(null);

	// Cross-variant duplicate purchase links: the same URL copied onto many colours (a
	// generic link) rather than colour-specific product pages. Mirrors the validator's
	// DuplicateLink rule (>= 3 variants) as an advisory — there is no safe auto-fix,
	// since only the contributor knows whether a colour-specific page exists. So the
	// affordance is navigational: narrow the list to the colours involved, mark them,
	// and hand the user off to the variant that needs the better link.
	let sharedLinks = $derived(findSharedPurchaseLinks(variants));

	/** Variant ids sharing at least one purchase link with two or more siblings. */
	let sharedLinkVariantIds = $derived(new Set(sharedLinks.flatMap((l) => l.variantIds)));

	/** Shared URLs mapped to the colours using them, for the create-variant form's hint. */
	let sharedLinkOwners = $derived(
		Object.fromEntries(sharedLinks.map((l) => [l.url, l.variantNames]))
	);

	/** Set by the banner's action; narrows the list to just those colours. */
	let showOnlySharedLink = $state(false);

	// A search or an edit that resolves the last shared link would otherwise leave the
	// list stuck on an empty filtered view.
	$effect(() => {
		if (sharedLinkVariantIds.size === 0) showOnlySharedLink = false;
	});

	let displayVariants = $derived.by(() =>
		withDeletedStubs({
			changes: $changes,
			submitted: submittedStore,
			useChangeTracking: $useChangeTracking,
			parentPath: `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			namespace: 'variants',
			items: variants,
			getKeys: (v) => [v.id, v.slug],
			buildStub: (id, stubName) =>
				({
					id,
					slug: id,
					filament_id: filamentId,
					name: stubName,
					color_hex: '#808080',
					discontinued: false
				}) as unknown as Variant
		})
	);

	let filteredVariants = $derived.by(() => {
		const base = showOnlySharedLink
			? displayVariants.filter((v) => sharedLinkVariantIds.has(v.slug ?? v.id))
			: displayVariants;
		const q = variantSearch.toLowerCase().trim();
		if (!q) return base;
		return base.filter((v) => {
			const fields = [v.name, v.id, v.slug, v.color_hex].filter(Boolean);
			if (fields.some((f) => String(f).toLowerCase().includes(q))) return true;
			if (v.discontinued && 'discontinued'.includes(q)) return true;
			if (v.traits) {
				const activeTraits = Object.entries(v.traits)
					.filter(([, val]) => val === true)
					.map(([key]) => key.replace(/_/g, ' '));
				if (activeTraits.some((t) => t.includes(q))) return true;
			}
			return false;
		});
	});

	// Fibers (carbon / glass) established by this filament's existing variants. A new
	// variant can't take the opposite fiber — a filament never mixes CF and GF.
	let filamentFibers = $derived(collectSiblingFibers(variants));
	// Traits each existing colour carries, for the "every other colour has this"
	// suggestion on a newly created variant.
	let variantTraits = $derived(variants.map(trueTraitKeys));

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () =>
			filament ? `brands/${brandId}/materials/${materialType}/filaments/${filament.id}` : null,
		getEntity: () => filament
	});

	const deleteFlow = createDeleteFlow(messageHandler);

	// --- Shared actions for THIS filament (detail-level) ---
	const filamentCopy = createCopyAction('filament', async () => {
		return await loadFilamentChildren(brandId, materialType, filamentId);
	});
	const filamentDuplicate = createDuplicateAction('filament', true, (data) => {
		formDrafts.clear(filamentCreateDraftKey);
		entityState.openDuplicate(data);
	});

	// --- Shared actions for VARIANT cards (no children, so no options modal) ---
	const variantCopy = createCopyAction('variant', null);
	const variantDuplicate = createDuplicateAction('variant', false, (data) => {
		createError = null;
		formDrafts.clear(variantCreateDraftKey);
		prefillVariantData = data as Variant;
		entityState.openCreate();
	});
	const variantPaste = createPasteHandler(
		'variant',
		(data) => {
			createError = null;
			formDrafts.clear(variantCreateDraftKey);
			prefillVariantData = data as Variant;
			entityState.openCreate();
		},
		(data) => {
			const variantSlug = generateSlug(data.name);
			return !!(
				variants.find((v) => (v.slug ?? v.id).toLowerCase() === variantSlug) ||
				variants.find((v) => v.name.toLowerCase() === data.name.trim().toLowerCase())
			);
		}
	);

	$effect(() => {
		if (!entityState.showCreateModal) {
			prefillVariantData = null;
		}
	});

	// --- Data loading ---
	$effect(() => {
		const params = { brandId, materialType, filamentId };
		const gen = ++loadGeneration;
		loading = true;
		error = null;
		entityState.showEditModal = false;

		(async () => {
			try {
				const [filamentData, variantsData] = await Promise.all([
					db.getFilament(params.brandId, params.materialType, params.filamentId),
					db.loadVariants(params.brandId, params.materialType, params.filamentId)
				]);
				if (gen !== loadGeneration) return;
				if (!filamentData) {
					const filamentPath = `brands/${params.brandId}/materials/${params.materialType}/filaments/${params.filamentId}`;
					const change = untrack(() => $changes.get(filamentPath));
					if (untrack(() => $useChangeTracking) && change?.operation === 'delete') {
						error =
							'This filament has been deleted in your local changes. Export your changes to finalize the deletion.';
					} else {
						error = 'Filament not found';
					}
					loading = false;
					return;
				}
				filament = filamentData;
				originalFilament = structuredClone(filamentData);
				variants = variantsData || [];
			} catch (e) {
				if (gen !== loadGeneration) return;
				error = e instanceof Error ? e.message : 'Failed to load filament';
			} finally {
				if (gen === loadGeneration) loading = false;
			}
		})();
	});

	async function handleSubmit(data: any) {
		if (!filament) return;
		entityState.saving = true;
		messageHandler.clear();
		try {
			const existingId = filament.slug || filament.id;
			const updatedFilament = {
				...filament,
				...data,
				id: existingId,
				slug: existingId
			} as Filament;
			const success = await db.saveFilament(
				brandId,
				materialType,
				existingId,
				updatedFilament,
				originalFilament ?? filament
			);
			if (success) {
				filament = updatedFilament;
				messageHandler.showSuccess('Filament saved successfully!');
				formDrafts.clear(filamentEditDraftKey);
				entityState.closeEdit();
			} else {
				messageHandler.showError('Failed to save filament');
			}
		} catch (e) {
			messageHandler.showError(e instanceof Error ? e.message : 'Failed to save filament');
		} finally {
			entityState.saving = false;
		}
	}

	function openDeleteFilament() {
		if (!filament) return;
		deleteFlow.open({
			type: 'filament',
			path: `brands/${brandId}/materials/${materialType}/filaments/${filamentId}`,
			label: 'Filament',
			name: filament.name,
			uuid: filament.uuid,
			movedFrom: filament.moved_from,
			deleteFn: () => db.deleteFilament(brandId, materialType, filamentId, filament!),
			navigateOnDelete: `/brands/${brandId}/${materialType}`
		});
	}

	async function handleCreateVariant(data: any) {
		entityState.creating = true;
		createError = null;
		try {
			const variantSlug = generateSlug(data.name);
			if (
				variants.find((v) => (v.slug ?? v.id).toLowerCase() === variantSlug) ||
				variants.find((v) => v.name.toLowerCase() === data.name.trim().toLowerCase())
			) {
				createError = `Variant "${data.name}" already exists in this filament`;
				entityState.creating = false;
				return;
			}
			// A filament can't mix carbon fiber and glass fiber across its variants.
			const fiberConflict = checkFiberConflict(
				fibersFromTraits(data.traits),
				collectSiblingFibers(variants)
			);
			if (fiberConflict) {
				createError = fiberConflict.message;
				entityState.creating = false;
				return;
			}
			const result = await db.createVariant(brandId, materialType, filamentId, data);
			if (result.success && result.variantSlug) {
				messageHandler.showSuccess('Variant created successfully!');
				formDrafts.clear(variantCreateDraftKey);
				entityState.closeCreate();
				goto(`/brands/${brandId}/${materialType}/${filamentId}/${result.variantSlug}`);
			} else {
				createError = 'Failed to create variant';
			}
		} catch (e) {
			createError = e instanceof Error ? e.message : 'Failed to create variant';
		} finally {
			entityState.creating = false;
		}
	}

	// --- Duplicate filament submit ---
	async function handleDuplicateFilamentSubmit(data: any) {
		entityState.creating = true;
		duplicateFilamentError = null;
		try {
			const filamentSlug = generateSlug(data.name);
			const siblingFilaments = await db.loadFilaments(brandId, materialType);
			if (siblingFilaments.find((f) => (f.slug ?? f.id).toLowerCase() === filamentSlug)) {
				duplicateFilamentError = `Filament "${data.name}" already exists`;
				entityState.creating = false;
				return;
			}
			const result = await db.createFilament(brandId, materialType, data);
			if (result.success && result.filamentId) {
				if (filamentDuplicate.withChildren && filament) {
					try {
						const sourceFilId = filament.slug ?? filament.id;
						await duplicateFilamentChildren(
							brandId,
							materialType,
							sourceFilId,
							brandId,
							materialType,
							result.filamentId
						);
					} catch (e) {
						console.error('Failed to duplicate children:', e);
					}
				}
				const clip = getClipboard();
				if (clip?.children && entityState.showPasteModal) {
					try {
						await pasteFilamentChildren(brandId, materialType, result.filamentId, clip.children);
					} catch (e) {
						console.error('Failed to paste children:', e);
					}
				}
				messageHandler.showSuccess('Filament created successfully!');
				formDrafts.clear(filamentCreateDraftKey);
				entityState.closeDuplicate();
				entityState.closePaste();
				goto(`/brands/${brandId}/${materialType}/${result.filamentId}`);
			} else {
				duplicateFilamentError = 'Failed to create filament';
			}
		} catch (e) {
			duplicateFilamentError = e instanceof Error ? e.message : 'Failed to duplicate filament';
		} finally {
			entityState.creating = false;
		}
	}

	// Child card: same modal, but stays on this page and prunes the list.
	function openDeleteVariant(variant: Variant) {
		const vSlug = variant.slug ?? variant.id;
		deleteFlow.open({
			type: 'variant',
			path: `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${vSlug}`,
			label: 'Variant',
			name: variant.name,
			uuid: variant.uuid,
			movedFrom: variant.moved_from,
			deleteFn: () => db.deleteVariant(brandId, materialType, filamentId, vSlug, variant),
			navigateOnDelete: null,
			onSuccess: () => {
				variants = variants.filter((v) => (v.slug ?? v.id) !== vSlug);
			}
		});
	}
</script>

{#snippet certificationsRender(certifications: string[])}
	<CertificationsDisplay {certifications} />
{/snippet}
{#snippet slicerSettingsRender(settings: Record<string, any>)}
	<SlicerSettingsDisplay {settings} />
{/snippet}
{#snippet orcaDownloadRender()}
	<OrcaDownloadButton brand={brandId} material={materialType} filament={filamentId}
		filamentName={filament?.name ?? ''} />
{/snippet}

<svelte:head>
	<title>{filament ? `${filament.name}` : 'Filament Not Found'}</title>
</svelte:head>

<div class="container mx-auto max-w-6xl px-4 py-8">
	<div class="mb-6">
		<BackButton href="/brands/{brandId}/{materialType}" label="Material" />
	</div>

	<DataDisplay {loading} {error} data={filament}>
		{#snippet children(filamentData)}
			<header class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<h1 class="text-3xl font-bold">{filamentData.name}</h1>
					{#if filamentData.discontinued}
						<span class="rounded-full bg-destructive/10 px-3 py-1 text-sm text-destructive"
							>Discontinued</span
						>
					{/if}
				</div>
				<p class="text-muted-foreground">ID: {filamentData.slug || filamentData.id}</p>
			</header>

			{#if entityState.hasLocalChanges}
				<MessageBanner type="info" message="Local changes - export to save" />
			{:else if entityState.submittedEntry}
				<SubmittedBanner entry={entityState.submittedEntry} />
			{/if}
			{#if messageHandler.message}
				<MessageBanner type={messageHandler.type} message={messageHandler.message} />
			{/if}

			<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
				<EntityDetails
					entity={filamentData}
					title="Filament Details"
					grid={true}
					fields={[
						{ key: 'name', label: 'Name', fullWidth: true },
						{ key: 'density', label: 'Density', format: (v) => `${v} g/cm³` },
						{ key: 'diameter_tolerance', label: 'Diameter Tolerance', format: (v) => `${v} mm` },
						{
							key: 'min_print_temperature',
							label: 'Print Temperature Range',
							format: (v) => `${v}°C - ${filamentData.max_print_temperature}°C`,
							hide: (v) => !v
						},
						{
							key: 'min_bed_temperature',
							label: 'Bed Temperature Range',
							format: (v) => `${v}°C - ${filamentData.max_bed_temperature}°C`,
							hide: (v) => !v
						},
						{
							key: 'preheat_temperature',
							label: 'Preheat Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						},
						{
							key: 'max_dry_temperature',
							label: 'Max Dry Temperature',
							format: (v) => `${v}°C`,
							hide: (v) => !v
						},
						{ key: 'shore_hardness_a', label: 'Shore Hardness A', hide: (v) => !v },
						{ key: 'shore_hardness_d', label: 'Shore Hardness D', hide: (v) => !v },
						{
							key: 'min_nozzle_diameter',
							label: 'Min Nozzle Diameter',
							format: (v) => `${v} mm`,
							hide: (v) => !v
						},
						{
							key: 'certifications',
							label: 'Certifications',
							hide: (v) => !v || v.length === 0,
							customRender: certificationsRender,
							fullWidth: true
						},
						{
							key: 'slicer_settings',
							label: 'Slicer Settings',
							hide: (v) => !v || Object.keys(v).length === 0,
							customRender: slicerSettingsRender,
							fullWidth: true
						},
						{
							key: 'orcaslicer_download',
							label: 'OrcaSlicer',
							hide: () => !orcaProfileUrl(brandId, materialType, filamentId, filamentData.name),
							customRender: orcaDownloadRender,
							fullWidth: true
						},
						{ key: 'data_sheet_url', label: 'Data Sheet', type: 'link', hide: (v) => !v },
						{ key: 'safety_sheet_url', label: 'Safety Sheet', type: 'link', hide: (v) => !v }
					]}
				>
					{#snippet actions()}
						<div class="flex gap-2">
							<Button onclick={entityState.openEdit} variant="primary">Edit</Button>
							<EntityActionDropdown
								entityType="filament"
								entityData={filamentData}
								entityPath="brands/{brandId}/materials/{materialType}/filaments/{filamentId}"
								isLocalCreate={entityState.isLocalCreate}
								onDuplicate={() => filamentDuplicate.request(filamentData)}
								onCopyRequest={() =>
									filamentCopy.request(
										filamentData,
										`brands/${brandId}/materials/${materialType}/filaments/${filamentId}`
									)}
								onPaste={(data) => {
									formDrafts.clear(filamentCreateDraftKey);
									entityState.openPaste(data);
								}}
								onDelete={openDeleteFilament}
								onViewDiff={entityState.openCloudCompare}
								parentNames={{ brand: '', material: '' }}
							/>
						</div>
					{/snippet}
				</EntityDetails>

				<ChildListPanel
					title="Variants"
					addLabel="Add Variant"
					onAdd={() => {
						createError = null;
						entityState.openCreate();
					}}
					itemCount={displayVariants.length}
					emptyMessage="No variants found for this filament."
					searchQuery={variantSearch}
					onSearch={(v) => (variantSearch = v)}
					searchPlaceholder="Search variants by name, color, traits..."
					filteredCount={filteredVariants.length}
					childEntityType="variant"
					onPaste={variantPaste}
				>
					{#snippet banner()}
						{#if sharedLinks.length > 0}
							<FixHint
								compact
								class="mb-4"
								fixLabel={showOnlySharedLink ? 'Show all' : 'Show affected'}
								onFix={() => (showOnlySharedLink = !showOnlySharedLink)}
								fixTitle={showOnlySharedLink
									? 'List every colour again'
									: `Narrow the list to the ${sharedLinkVariantIds.size} colours sharing a link`}
							>
								{sharedLinks.length === 1
									? 'A purchase link is'
									: `${sharedLinks.length} purchase links are`}
								reused across 3 or more colours of this filament. Prefer a colour-specific product page
								for each variant where one exists.
							</FixHint>
						{/if}
					{/snippet}
					{#each filteredVariants as variant}
						{@const variantPath = `brands/${brandId}/materials/${materialType}/filaments/${filamentId}/variants/${variant.slug ?? variant.id}`}
						{@const changeProps = getChildChangeProps(
							$changes,
							$useChangeTracking,
							variantPath,
							submittedStore
						)}
						{@const sizesCount = variant.sizes?.length ?? 0}
						{@const sizesInfo =
							sizesCount > 0 ? `${sizesCount} size${sizesCount !== 1 ? 's' : ''}` : undefined}
						<EntityCard
							entity={variant}
							name={variant.name}
							id={variant.slug}
							href="/brands/{brandId}/{materialType}/{filamentId}/{variant.slug}"
							colorHex={variant.color_hex}
							hoverColor="orange"
							showLogo={false}
							badge={variant.discontinued ? { text: 'Discontinued', color: 'red' } : undefined}
							secondaryInfo={sizesInfo}
							hasLocalChanges={changeProps.hasLocalChanges}
							localChangeType={changeProps.localChangeType}
							hasSubmittedChanges={changeProps.hasSubmittedChanges}
							submittedChangeType={changeProps.submittedChangeType}
							submittedPrNumber={changeProps.submittedPrNumber}
							entityType="variant"
							onCopy={() => variantCopy.request(variant, variantPath)}
							onDuplicate={() => variantDuplicate.request(variant)}
							onPaste={variantPaste}
							onDelete={changeProps.localChangeType === 'delete' ||
							changeProps.submittedChangeType === 'delete'
								? undefined
								: () => openDeleteVariant(variant)}
						></EntityCard>
					{/each}
				</ChildListPanel>
			</div>
		{/snippet}
	</DataDisplay>
</div>

<Modal
	show={entityState.showEditModal}
	title="Edit Filament"
	onClose={entityState.closeEdit}
	maxWidth="5xl"
>
	{#if filament}
		<div class="h-[70vh]">
			<FilamentForm
				{filament}
				draftKey={filamentEditDraftKey}
				{brandId}
				{materialType}
				selfPath="brands/{brandId}/materials/{materialType}/filaments/{filamentId}"
				onSubmit={handleSubmit}
				saving={entityState.saving}
			/>
		</div>
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

<!-- Copy/Duplicate options modals (filament-level) -->
<DuplicateOptionsModal
	show={filamentCopy.showOptions}
	onClose={filamentCopy.close}
	onSelect={filamentCopy.select}
	title="Copy Filament"
	childrenDescription="Copies all color variants into the clipboard along with the filament."
/>
<DuplicateOptionsModal
	show={filamentDuplicate.showOptions}
	onClose={filamentDuplicate.close}
	onSelect={filamentDuplicate.select}
	title="Duplicate Filament"
	childrenDescription="Copies all color variants under this filament into the new duplicate."
/>

<!-- Duplicate/Paste Filament Modals -->
<Modal
	show={entityState.showDuplicateModal}
	title="Duplicate Filament"
	onClose={entityState.closeDuplicate}
	maxWidth="5xl"
>
	{#if duplicateFilamentError}<MessageBanner type="error" message={duplicateFilamentError} />{/if}
	{#if entityState.duplicateData}
		<div class="h-[70vh]">
			<FilamentForm
				filament={entityState.duplicateData}
				draftKey={filamentCreateDraftKey}
				{brandId}
				{materialType}
				onSubmit={handleDuplicateFilamentSubmit}
				saving={entityState.creating}
			/>
		</div>
	{/if}
</Modal>
<Modal
	show={entityState.showPasteModal}
	title="Paste Filament"
	onClose={entityState.closePaste}
	maxWidth="5xl"
>
	{#if duplicateFilamentError}<MessageBanner type="error" message={duplicateFilamentError} />{/if}
	{#if entityState.pasteData}
		<div class="h-[70vh]">
			<FilamentForm
				filament={entityState.pasteData}
				draftKey={filamentCreateDraftKey}
				{brandId}
				{materialType}
				onSubmit={handleDuplicateFilamentSubmit}
				saving={entityState.creating}
			/>
		</div>
	{/if}
</Modal>

<CloudCompareModal
	show={entityState.showCloudCompareModal}
	onClose={entityState.closeCloudCompare}
	title="Compare Filament with Cloud"
	currentData={filament}
	apiPath="/api/brands/{brandId}/materials/{materialType}/filaments/{filamentId}"
/>

<Modal
	show={entityState.showCreateModal}
	title="Create New Variant"
	onClose={() => {
		createError = null;
		entityState.closeCreate();
	}}
	maxWidth="5xl"
	height="3/4"
>
	{#if createError}<MessageBanner type="error" message={createError} />{/if}
	<InFlightHint
		path="brands/{brandId}/materials/{materialType}/filaments/{filamentId}"
		label="filament"
	/>
	<VariantForm
		variant={prefillVariantData ?? undefined}
		draftKey={variantCreateDraftKey}
		filamentName={`${filament?.name ?? ''} ${filamentId}`}
		{materialType}
		siblingFibers={[...filamentFibers]}
		siblingNames={variants.map((v) => v.name)}
		siblingTraits={variantTraits}
		{sharedLinkOwners}
		onSubmit={handleCreateVariant}
		saving={entityState.creating}
	/>
</Modal>
