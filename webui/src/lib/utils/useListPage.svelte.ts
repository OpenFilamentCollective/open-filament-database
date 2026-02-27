/**
 * List Page Composable
 *
 * Extracts the shared behavior of entity list pages (brands, stores).
 * Handles: data loading, schema lazy-fetching, create modal, form submission
 * with slug generation + logo upload + save + redirect.
 */

import { onMount } from 'svelte';
import { goto } from '$app/navigation';
import { db } from '$lib/services/database';
import { createMessageHandler } from '$lib/utils/messageHandler.svelte';
import { createEntityState } from '$lib/utils/entityState.svelte';
import { generateSlug } from '$lib/services/entityService';
import { saveLogoImage } from '$lib/utils/logoManagement';
import { fetchEntitySchema, type SchemaName } from '$lib/services/schemaService';

export interface ListPageConfig<T> {
	/** Which key to extract from db.loadIndex() result */
	indexKey: 'brands' | 'stores';
	/** Schema type for lazy-loading via fetchEntitySchema */
	schemaType: SchemaName;
	/** Logo type passed to saveLogoImage */
	logoType: 'brand' | 'store';
	/** Human-readable entity label for messages */
	entityLabel: string;
	/** Build the entity data from form data, generated slug, and logo filename */
	buildEntity: (data: any, slug: string, logoFilename: string) => T;
	/** The save function */
	saveFn: (entity: T) => Promise<boolean>;
	/** URL prefix for redirect after creation, e.g. '/brands' */
	urlPrefix: string;
	/** Optional duplicate check; return error message or null */
	checkDuplicate?: (items: T[], slug: string, data: any) => string | null;
}

export interface ListPageState<T> {
	readonly items: T[];
	readonly loading: boolean;
	readonly error: string | null;
	readonly schema: any;
	entityState: ReturnType<typeof createEntityState>;
	messageHandler: ReturnType<typeof createMessageHandler>;
	openCreateModal: () => void;
	handleSubmit: (data: any) => Promise<void>;
	loadData: () => Promise<void>;
}

/**
 * Create shared state and behavior for an entity list page.
 *
 * @example
 * ```typescript
 * const listPage = createListPage<Brand>({
 *   indexKey: 'brands',
 *   schemaType: 'brand',
 *   logoType: 'brand',
 *   entityLabel: 'Brand',
 *   buildEntity: (data, slug, logo) => ({ ...data, id: slug, slug, logo }),
 *   saveFn: (entity) => db.saveBrand(entity),
 *   urlPrefix: '/brands',
 *   checkDuplicate: (items, slug) => {
 *     const dup = items.find(b => (b.slug ?? b.id).toLowerCase() === slug.toLowerCase());
 *     return dup ? `Brand already exists` : null;
 *   }
 * });
 * ```
 */
export function createListPage<T>(config: ListPageConfig<T>): ListPageState<T> {
	let items: T[] = $state([]);
	let loading = $state(true);
	let error: string | null = $state(null);
	let schema: any = $state(null);

	const messageHandler = createMessageHandler();

	const entityState = createEntityState({
		getEntityPath: () => null,
		getEntity: () => null
	});

	async function loadData() {
		loading = true;
		error = null;
		try {
			const index = await db.loadIndex();
			const raw = index[config.indexKey] as T[];
			items = raw.sort((a: any, b: any) => a.name.localeCompare(b.name));
		} catch (e) {
			error = e instanceof Error ? e.message : `Failed to load ${config.entityLabel.toLowerCase()}s`;
		} finally {
			loading = false;
		}
	}

	function openCreateModal() {
		messageHandler.clear();
		entityState.openCreate();
		if (!schema) {
			fetchEntitySchema(config.schemaType)
				.then((data) => {
					if (data) {
						schema = data;
					} else {
						console.error('Failed to load schema: received null');
					}
				})
				.catch((e) => {
					console.error('Failed to load schema:', e);
				});
		}
	}

	async function handleSubmit(data: any) {
		entityState.creating = true;
		messageHandler.clear();

		try {
			const slug = generateSlug(data.name);

			if (config.checkDuplicate) {
				const duplicateError = config.checkDuplicate(items, slug, data);
				if (duplicateError) {
					messageHandler.showError(duplicateError);
					entityState.creating = false;
					return;
				}
			}

			let logoFilename = '';
			if (entityState.logoChanged && entityState.logoDataUrl) {
				const savedPath = await saveLogoImage(slug, entityState.logoDataUrl, config.logoType);
				if (!savedPath) {
					messageHandler.showError('Failed to save logo');
					entityState.creating = false;
					return;
				}
				logoFilename = savedPath;
			}

			const entity = config.buildEntity(data, slug, logoFilename);
			const success = await config.saveFn(entity);

			if (success) {
				messageHandler.showSuccess(`${config.entityLabel} created successfully!`);
				entityState.closeCreate();
				entityState.resetLogo();
				goto(`${config.urlPrefix}/${slug}`);
			} else {
				messageHandler.showError(`Failed to create ${config.entityLabel.toLowerCase()}`);
			}
		} catch (e) {
			messageHandler.showError(
				e instanceof Error ? e.message : `Failed to create ${config.entityLabel.toLowerCase()}`
			);
		} finally {
			entityState.creating = false;
		}
	}

	onMount(loadData);

	// Reload when navigating back to this page
	$effect(() => {
		if (typeof window !== 'undefined') {
			loadData();
		}
	});

	return {
		get items() { return items; },
		get loading() { return loading; },
		get error() { return error; },
		get schema() { return schema; },
		entityState,
		messageHandler,
		openCreateModal,
		handleSubmit,
		loadData
	};
}
