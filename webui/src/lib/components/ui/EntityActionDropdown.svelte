<script lang="ts">
	import DropdownMenu from './DropdownMenu.svelte';
	import type { DropdownItem } from './DropdownMenu.svelte';
	import {
		copyEntity,
		getClipboard,
		hasCompatibleClipboard,
		prepareDuplicateData,
		type ClipboardEntityType
	} from '$lib/services/clipboardService';
	import { get } from 'svelte/store';
	import { apiBaseUrl, isLocalMode } from '$lib/stores/environment';

	const GITHUB_REPO_BASE = 'https://github.com/OpenFilamentCollective/open-filament-database';

	interface Props {
		entityType: ClipboardEntityType;
		entityData: Record<string, any>;
		entityPath: string;
		isLocalCreate: boolean;
		onDuplicate: (data: Record<string, any>) => void;
		onPaste: (data: Record<string, any>) => void;
		onDelete: () => void;
		onViewDiff?: () => void;
		/** If provided, called instead of default copy - lets parent show options modal */
		onCopyRequest?: () => void;
		/** Extra context needed for GitHub URL construction */
		parentNames?: Record<string, string>;
	}

	let {
		entityType,
		entityData,
		entityPath,
		isLocalCreate,
		onDuplicate,
		onPaste,
		onDelete,
		onViewDiff,
		onCopyRequest,
		parentNames = {}
	}: Props = $props();

	let copyFeedback = $state('');
	const isLocal = $derived(get(isLocalMode));

	function buildApiViewUrl(): string {
		const base = get(apiBaseUrl);
		return `${base || ''}/api/${entityPath.replace(/\//g, '/')}`;
	}

	function buildGithubUrl(): string | null {
		const name = entityData.name || entityData.material || '';
		if (!name) return null;

		switch (entityType) {
			case 'brand':
				return `${GITHUB_REPO_BASE}/blob/main/data/${encodeURIComponent(name)}/brand.json`;
			case 'material': {
				const brandName = parentNames.brand || '';
				if (!brandName) return null;
				return `${GITHUB_REPO_BASE}/blob/main/data/${encodeURIComponent(brandName)}/${encodeURIComponent(entityData.material || name)}/material.json`;
			}
			case 'filament': {
				const brandName = parentNames.brand || '';
				const materialName = parentNames.material || '';
				if (!brandName || !materialName) return null;
				return `${GITHUB_REPO_BASE}/blob/main/data/${encodeURIComponent(brandName)}/${encodeURIComponent(materialName)}/${encodeURIComponent(name)}/filament.json`;
			}
			case 'variant': {
				const brandName = parentNames.brand || '';
				const materialName = parentNames.material || '';
				const filamentName = parentNames.filament || '';
				if (!brandName || !materialName || !filamentName) return null;
				return `${GITHUB_REPO_BASE}/blob/main/data/${encodeURIComponent(brandName)}/${encodeURIComponent(materialName)}/${encodeURIComponent(filamentName)}/${encodeURIComponent(name)}/variant.json`;
			}
			case 'store':
				return `${GITHUB_REPO_BASE}/blob/main/stores/${encodeURIComponent(entityData.id || entityData.slug || '')}.json`;
			default:
				return null;
		}
	}

	async function handleCopy() {
		if (onCopyRequest) {
			onCopyRequest();
			return;
		}
		await copyEntity(entityType, entityData, entityPath);
		copyFeedback = 'Copied!';
		setTimeout(() => { copyFeedback = ''; }, 2000);
	}

	function handleDuplicate() {
		const dupData = prepareDuplicateData(entityType, entityData);
		onDuplicate(dupData);
	}

	function handlePaste() {
		const entry = getClipboard();
		if (entry && entry.entityType === entityType) {
			const pasteData = prepareDuplicateData(entityType, entry.data);
			onPaste(pasteData);
		}
	}

	function handleViewApi() {
		const url = buildApiViewUrl();
		window.open(url, '_blank', 'noopener,noreferrer');
	}

	function handleViewGithub() {
		const url = buildGithubUrl();
		if (url) {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	}

	const githubUrl = $derived(buildGithubUrl());

	const items = $derived.by((): (DropdownItem | 'separator')[] => {
		const canPaste = hasCompatibleClipboard(entityType);
		const result: (DropdownItem | 'separator')[] = [
			{
				label: 'Duplicate',
				onClick: handleDuplicate
			},
			{
				label: copyFeedback || 'Copy',
				onClick: handleCopy,
				disabled: !!copyFeedback
			},
			{
				label: 'Paste',
				onClick: handlePaste,
				disabled: !canPaste
			},
			'separator',
			// Local mode: show "View JSON" which opens the local API endpoint
			// Cloud mode: show "View in API", "View on GitHub", "Compare with Cloud"
			{
				label: isLocal ? 'View JSON' : 'View in API',
				onClick: handleViewApi,
				hidden: isLocalCreate
			},
			{
				label: 'View on GitHub',
				onClick: handleViewGithub,
				hidden: isLocal || isLocalCreate || !githubUrl
			},
			{
				label: 'Compare with Cloud',
				onClick: () => onViewDiff?.(),
				hidden: isLocal || isLocalCreate || !onViewDiff
			},
			'separator',
			{
				label: 'Delete',
				onClick: onDelete,
				destructive: true
			}
		];
		return result;
	});
</script>

<DropdownMenu {items} align="right" />
