<script lang="ts">
	import { changeStore, changeCount, hasChanges, changesList } from '$lib/stores/changes';
	import { isCloudMode, isLocalMode } from '$lib/stores/environment';
	import type { EntityChange } from '$lib/types/changes';
	import type { Store } from '$lib/types/database';
	import { Button, Modal, LoadingSpinner } from '$lib/components/ui';
	import { TwoColumnLayout } from '$lib/components/form-fields';
	import SubmissionWizard from './SubmissionWizard.svelte';
	import { db } from '$lib/services/database';
	import { generateChangeTitle } from '$lib/utils/changeTitleGenerator';
	import { authStore } from '$lib/stores/auth';
	import { STORAGE_KEY_REOPEN_WIZARD } from '$lib/config/storageKeys';
	import { onMount, onDestroy } from 'svelte';

	let menuOpen = $state(false);
	let expandedChanges = $state<Set<string>>(new Set());
	let stores = $state<Store[]>([]);

	// Submit modal state
	let submitModalOpen = $state(false);
	let reopenedAfterAuth = $state<'github' | 'simplyprint' | false>(false);

	// Save to disk state (local mode only)
	let savingToDisk = $state(false);
	let saveResult = $state<{ success: boolean; message: string } | null>(null);

	// Validation state
	let validationStatus = $state<'idle' | 'running' | 'complete' | 'error'>('idle');
	let validationErrors = $state<Array<{ category: string; level: string; message: string; path?: string }>>([]);
	let validationErrorCount = $state(0);
	let validationWarningCount = $state(0);
	let validationIsValid = $state<boolean | null>(null);
	let validationProgress = $state('');
	let validationHasRun = $state(false);
	let validationEventSource = $state<EventSource | null>(null);

	// Session ID for cloud-mode validation (allows multiple users to validate concurrently)
	function getValidationSessionId(): string {
		const STORAGE_KEY = 'ofd_validation_session_id';
		let id = localStorage.getItem(STORAGE_KEY);
		if (!id) {
			id = crypto.randomUUID();
			localStorage.setItem(STORAGE_KEY, id);
		}
		return id;
	}

	// Load stores on mount for resolving store_id to store names
	onMount(async () => {
		stores = await db.loadStores();

		// Reopen submission wizard after OAuth redirect (GitHub or SimplyPrint)
		const savedMethod = localStorage.getItem(STORAGE_KEY_REOPEN_WIZARD);
		if (savedMethod) {
			localStorage.removeItem(STORAGE_KEY_REOPEN_WIZARD);
			const params = new URLSearchParams(window.location.search);
			const hasSuccess = params.has('auth_success') || params.has('sp_auth_success');
			const authError = params.get('sp_auth_error') || params.get('auth_error');

			if (hasSuccess || authError) {
				// Clean up the query params
				params.delete('auth_success');
				params.delete('sp_auth_success');
				params.delete('sp_auth_error');
				params.delete('auth_error');
				const newUrl = params.toString()
					? `${window.location.pathname}?${params}`
					: window.location.pathname;
				history.replaceState({}, '', newUrl);

				if (authError) {
					console.error('OAuth error:', authError);
					alert(`Authentication failed: ${authError}. Check the server logs for details.`);
					return;
				}

				// Wait for auth status to be fetched before opening wizard
				await authStore.checkStatus();

				reopenedAfterAuth = savedMethod === 'simplyprint' ? 'simplyprint' : 'github';
				submitModalOpen = true;
			}
		}
	});

	onDestroy(() => {
		cleanupValidationStream();
	});

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
	}

	function toggleExpanded(path: string) {
		const newSet = new Set(expandedChanges);
		if (newSet.has(path)) {
			newSet.delete(path);
		} else {
			newSet.add(path);
		}
		expandedChanges = newSet;
	}

	function formatTimestamp(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);

		if (diffMins < 1) return 'Just now';
		if (diffMins < 60) return `${diffMins}m ago`;

		const diffHours = Math.floor(diffMins / 60);
		if (diffHours < 24) return `${diffHours}h ago`;

		const diffDays = Math.floor(diffHours / 24);
		return `${diffDays}d ago`;
	}

	function getOperationBadge(operation: EntityChange['operation']): { bg: string; text: string; label: string } {
		switch (operation) {
			case 'create':
				return { bg: 'bg-green-500/10', text: 'text-green-700 dark:text-green-400', label: 'Created' };
			case 'update':
				return { bg: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-400', label: 'Updated' };
			case 'delete':
				return { bg: 'bg-destructive/10', text: 'text-destructive', label: 'Deleted' };
			default:
				return { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Changed' };
		}
	}

	function entityPathToUrl(entityPath: string): string {
		const parts = entityPath.split('/');
		const urlParts = [parts[0]];
		for (let i = 1; i < parts.length; i += 2) {
			urlParts.push(parts[i]);
		}
		return '/' + urlParts.join('/');
	}

	function undoChange(change: EntityChange) {
		if (confirm('Are you sure you want to undo this change?')) {
			changeStore.removeChange(change.entity.path);

			const entityUrl = entityPathToUrl(change.entity.path);
			const currentPath = window.location.pathname;

			if (change.operation === 'delete' && currentPath === entityUrl) {
				const parts = currentPath.split('/').filter(Boolean);
				parts.pop();
				window.location.href = '/' + parts.join('/');
			} else if (
				currentPath === entityUrl ||
				currentPath.startsWith(entityUrl + '/') ||
				entityUrl.startsWith(currentPath + '/')
			) {
				window.location.reload();
			}
		}
	}

	async function exportChanges() {
		const exportData = await changeStore.exportChanges();
		const json = JSON.stringify(exportData, null, 2);
		const blob = new Blob([json], { type: 'application/json' });
		const url = URL.createObjectURL(blob);

		const a = document.createElement('a');
		a.href = url;
		a.download = `ofd-changes-${Date.now()}.json`;
		a.click();

		URL.revokeObjectURL(url);
	}

	function clearAllChanges() {
		if (confirm('Are you sure you want to clear all pending changes? This cannot be undone.')) {
			changeStore.clear();
			closeMenu();
			window.location.reload();
		}
	}

	function openSubmitModal() {
		submitModalOpen = true;
		saveResult = null;

		if (!validationHasRun) {
			startValidation();
		}
	}

	function cleanupValidationStream() {
		if (validationEventSource) {
			validationEventSource.close();
			validationEventSource = null;
		}
	}

	function applyValidationResult(result: any) {
		validationStatus = 'complete';
		validationErrors = result?.errors || [];
		validationErrorCount = result?.error_count || 0;
		validationWarningCount = result?.warning_count || 0;
		validationIsValid = result?.is_valid ?? false;
		validationProgress = '';
	}

	function connectToValidationStream(sseUrl: string) {
		const es = new EventSource(sseUrl);
		validationEventSource = es;

		// Extract jobId from the SSE URL for fallback polling
		const jobIdMatch = sseUrl.match(/\/stream\/(.+)$/);
		const jobId = jobIdMatch?.[1] ?? null;

		es.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);

				if (data.type === 'progress') {
					validationProgress = data.message || data.category || 'Validating...';
				} else if (data.type === 'complete') {
					applyValidationResult(data.result);
					es.close();
					validationEventSource = null;
				} else if (data.type === 'error') {
					validationStatus = 'error';
					validationProgress = '';
					validationErrors = [{ category: 'System', level: 'ERROR', message: data.message || 'Validation failed' }];
					validationErrorCount = 1;
					es.close();
					validationEventSource = null;
				}
			} catch {
				// Ignore parse errors on individual events
			}
		};

		es.onerror = async () => {
			es.close();
			validationEventSource = null;

			if (validationStatus !== 'running') return;

			// The stream closed while we still think validation is running.
			// This can happen if cloud validation finished before we connected.
			// Check the job result directly before reporting an error.
			if (jobId) {
				try {
					const res = await fetch(`/api/validate/result/${jobId}`);
					if (res.ok) {
						const data = await res.json();
						if (data.status === 'complete' && data.result) {
							applyValidationResult(data.result);
							return;
						}
					}
				} catch {
					// Fallback fetch failed, report original error below
				}
			}

			validationStatus = 'error';
			validationProgress = '';
			validationErrors = [{ category: 'System', level: 'ERROR', message: 'Lost connection to validation stream' }];
			validationErrorCount = 1;
		};
	}

	async function startValidation() {
		cleanupValidationStream();

		validationStatus = 'running';
		validationErrors = [];
		validationErrorCount = 0;
		validationWarningCount = 0;
		validationIsValid = null;
		validationProgress = 'Starting validation...';
		validationHasRun = true;

		try {
			// In cloud mode, use a per-session UUID so multiple users can validate concurrently
			const sessionId = $isCloudMode ? getValidationSessionId() : undefined;
			const statusUrl = sessionId
				? `/api/validate/status?sessionId=${sessionId}`
				: '/api/validate/status';

			const statusResponse = await fetch(statusUrl);
			const statusData = await statusResponse.json();

			if (statusData.running) {
				const streamUrl = sessionId
					? `/api/validate/stream/${statusData.jobId}`
					: '/api/validate/stream/current';
				connectToValidationStream(streamUrl);
				return;
			}

			// Include pending changes so validation runs with them applied
			const exportData = $hasChanges ? await changeStore.exportChanges() : null;
			const body: Record<string, any> = { type: 'full' };
			if (exportData && exportData.changes.length > 0) {
				body.changes = exportData.changes;
				body.images = exportData.images;
			}
			if (sessionId) {
				body.sessionId = sessionId;
			}

			const response = await fetch('/api/validate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (response.status === 409) {
				const streamUrl = sessionId
					? `/api/validate/stream/validation-${sessionId}`
					: '/api/validate/stream/current';
				connectToValidationStream(streamUrl);
				return;
			}

			if (!response.ok) {
				throw new Error('Failed to start validation');
			}

			const data = await response.json();
			connectToValidationStream(data.sseUrl);
		} catch (error: any) {
			validationStatus = 'error';
			validationProgress = '';
			validationErrors = [{ category: 'System', level: 'ERROR', message: error.message || 'Failed to start validation' }];
			validationErrorCount = 1;
		}
	}

	async function saveToDisk() {
		savingToDisk = true;
		saveResult = null;

		try {
			const exportData = await changeStore.exportChanges();

			const imagesWithPaths: Record<string, any> = {};
			const cs = $changeStore;
			for (const [imageId, imageData] of Object.entries(exportData.images)) {
				const ref = cs.images[imageId];
				imagesWithPaths[imageId] = {
					...imageData,
					entityPath: ref?.entityPath || ''
				};
			}

			const response = await fetch('/api/save', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					changes: exportData.changes,
					images: imagesWithPaths
				})
			});

			const result = await response.json();

			if (result.success) {
				saveResult = { success: true, message: result.message || 'Changes saved successfully' };
				changeStore.clear();
				window.location.reload();
			} else {
				saveResult = {
					success: false,
					message: result.message || result.error || 'Some changes failed to save'
				};
			}
		} catch (error: any) {
			saveResult = { success: false, message: error.message || 'Failed to save' };
		} finally {
			savingToDisk = false;
		}
	}

	// Wizard callbacks: return results instead of managing state directly
	async function submitSimplyPrintForWizard(): Promise<{ success: boolean; message: string; uuid?: string; prUrl?: string }> {
		const exportData = await changeStore.exportChanges();

		const imagesWithPaths: Record<string, any> = {};
		const cs = $changeStore;
		for (const [imageId, imageData] of Object.entries(exportData.images)) {
			const ref = cs.images[imageId];
			imagesWithPaths[imageId] = {
				...imageData,
				entityPath: ref?.entityPath || ''
			};
		}

		const response = await fetch('/api/anon/submit', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				changes: exportData.changes,
				images: imagesWithPaths,
				title: generateChangeTitle(exportData.changes)
			})
		});

		const result = await response.json();

		if (result.success) {
			changeStore.clear();
			return {
				success: true,
				message: 'Your changes have been submitted for review by a maintainer.',
				uuid: result.uuid,
				prUrl: result.prUrl
			};
		} else {
			return {
				success: false,
				message: result.error || 'Failed to submit changes'
			};
		}
	}

	async function createPRForWizard(title: string, description: string): Promise<{ success: boolean; message: string; prUrl?: string }> {
		const exportData = await changeStore.exportChanges();

		const imagesWithPaths: Record<string, any> = {};
		const cs = $changeStore;
		for (const [imageId, imageData] of Object.entries(exportData.images)) {
			const ref = cs.images[imageId];
			imagesWithPaths[imageId] = {
				...imageData,
				entityPath: ref?.entityPath || ''
			};
		}

		const response = await fetch('/api/github/create-pr', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				changes: exportData.changes,
				images: imagesWithPaths,
				title: title || generateChangeTitle(exportData.changes),
				description
			})
		});

		const result = await response.json();

		if (result.success) {
			changeStore.clear();
			return {
				success: true,
				message: `PR #${result.prNumber} created successfully!`,
				prUrl: result.prUrl
			};
		} else {
			return {
				success: false,
				message: result.error || 'Failed to create PR'
			};
		}
	}

	function getStoreName(storeId: string): string {
		const store = stores.find((s) => s.id === storeId);
		return store?.name || storeId;
	}

	function formatValue(value: any): string {
		if (value === null) return 'null';
		if (value === undefined) return 'undefined';
		if (typeof value === 'object') {
			const enhanced = JSON.parse(JSON.stringify(value));
			enhancePurchaseLinks(enhanced);
			return JSON.stringify(enhanced, null, 2);
		}
		return String(value);
	}

	function enhancePurchaseLinks(obj: any): void {
		if (!obj || typeof obj !== 'object') return;

		if (Array.isArray(obj)) {
			for (const item of obj) {
				enhancePurchaseLinks(item);
			}
		} else {
			if ('store_id' in obj && typeof obj.store_id === 'string') {
				const storeName = getStoreName(obj.store_id);
				if (storeName !== obj.store_id) {
					obj.store = storeName;
				}
			}
			for (const key of Object.keys(obj)) {
				if (typeof obj[key] === 'object') {
					enhancePurchaseLinks(obj[key]);
				}
			}
		}
	}
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape' && menuOpen) closeMenu(); }} />

<div class="relative">
	<Button
		onclick={toggleMenu}
		variant="ghost"
		size="sm"
		title={$hasChanges ? `${$changeCount} pending changes` : 'No pending changes'}
	>
		<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
			<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
			<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd" />
		</svg>
		Changes
		{#if $hasChanges}
			<span class="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-medium text-white">
				{$changeCount}
			</span>
		{/if}
	</Button>

	{#if menuOpen}
		<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
		<div class="fixed inset-0 z-50" onclick={closeMenu} role="presentation" aria-hidden="true"></div>

		<div class="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover shadow-md">
			<!-- Header -->
			<div class="flex items-center justify-between border-b px-4 py-3">
				<div>
					<h3 class="font-semibold">Pending Changes</h3>
					{#if $hasChanges}
						<p class="text-xs text-muted-foreground">{$changeCount} unsaved {$changeCount === 1 ? 'change' : 'changes'}</p>
					{/if}
				</div>
				<Button onclick={closeMenu} variant="ghost" size="icon" class="h-8 w-8">
					<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
				</Button>
			</div>

			<!-- Content -->
			<div class="max-h-96 overflow-y-auto">
				{#if $hasChanges}
					<div class="divide-y">
						{#each $changesList as change}
							{@const badge = getOperationBadge(change.operation)}
							{@const isExpanded = expandedChanges.has(change.entity.path)}
							<div class="p-3">
								<!-- Change header -->
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0 flex-1">
										<div class="flex items-center gap-2">
											<span class="rounded px-1.5 py-0.5 text-xs font-medium {badge.bg} {badge.text}">
												{badge.label}
											</span>
											<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
												{change.entity.type}
											</span>
											<span class="text-xs text-muted-foreground">
												{formatTimestamp(change.timestamp)}
											</span>
										</div>
										<p class="mt-1 truncate text-sm font-medium">{change.description}</p>
										<p class="truncate text-xs text-muted-foreground">{change.entity.path}</p>
									</div>
									<Button
										onclick={() => undoChange(change)}
										variant="ghost"
										size="sm"
										class="h-7 shrink-0 text-xs hover:bg-destructive/10 hover:text-destructive"
									>
										Undo
									</Button>
								</div>

								<!-- Property changes -->
								{#if change.propertyChanges && change.propertyChanges.length > 0}
									<Button
										onclick={() => toggleExpanded(change.entity.path)}
										variant="ghost"
										size="sm"
										class="mt-2 h-auto w-full justify-start px-0 py-1 text-xs text-muted-foreground hover:text-foreground"
									>
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-3 w-3 transition-transform {isExpanded ? 'rotate-90' : ''}"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
										</svg>
										{change.propertyChanges.length} {change.propertyChanges.length === 1 ? 'field' : 'fields'} changed
									</Button>

									{#if isExpanded}
										<div class="mt-2 space-y-2 rounded border bg-muted/50 p-2 text-xs">
											{#each change.propertyChanges as propChange}
												<div>
													<span class="font-medium">{propChange.property}</span>
													{#if propChange.oldValue === undefined}
														<span class="ml-1 text-green-600 dark:text-green-400">added</span>
														<pre class="mt-1 overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
													{:else if propChange.newValue === undefined}
														<span class="ml-1 text-destructive">removed</span>
														<pre class="mt-1 overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
													{:else}
														<div class="mt-1 grid gap-1">
															<pre class="overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
															<pre class="overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									{/if}
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<div class="flex flex-col items-center justify-center px-4 py-8 text-center">
						<svg xmlns="http://www.w3.org/2000/svg" class="mb-2 h-8 w-8 text-muted-foreground/50" viewBox="0 0 20 20" fill="currentColor">
							<path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
							<path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm9.707 5.707a1 1 0 00-1.414-1.414L9 12.586l-1.293-1.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
						</svg>
						<p class="font-medium text-muted-foreground">No pending changes</p>
						<p class="mt-1 text-xs text-muted-foreground">
							Changes you make will appear here
						</p>
					</div>
				{/if}
			</div>

			<!-- Footer actions -->
			{#if $hasChanges}
				<div class="flex gap-2 border-t p-3">
					<Button onclick={clearAllChanges} variant="ghost" size="sm" class="hover:bg-destructive/10 hover:text-destructive">
						Clear All
					</Button>
					<div class="flex-1"></div>
					<Button onclick={openSubmitModal} variant="primary" size="sm">
						<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
						</svg>
						{$isLocalMode ? 'Save Changes' : 'Submit Changes'}
					</Button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<!-- Submit Modal -->
<Modal show={submitModalOpen} title={$isLocalMode ? 'Save Changes' : 'Submit Changes'} onClose={() => { submitModalOpen = false; cleanupValidationStream(); }} maxWidth="6xl" height="3/4">
	{@const detailedSummary = changeStore.getDetailedSummary()}

	<div class="h-full overflow-hidden">
	<TwoColumnLayout leftWidth="1/2" leftSpacing="md">
		{#snippet leftContent()}
			<!-- Validation Section (only shown when running or has issues) -->
			{#if (validationStatus === 'complete' && !validationIsValid) || validationStatus === 'error'}
				<div class="flex min-h-0 flex-1 flex-col rounded-lg border bg-muted/30 p-4">
					<div class="mb-2 flex shrink-0 items-center justify-between">
						<h4 class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Validation</h4>
						<Button
							onclick={() => startValidation()}
							variant="ghost"
							size="icon"
							class="h-7 w-7"
							title="Re-run validation"
							disabled={false}
						>
							<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd" />
							</svg>
						</Button>
					</div>

					{#if validationStatus === 'complete'}
						<div class="mb-2 flex shrink-0 items-center gap-2">
							{#if validationErrorCount > 0}
								<span class="rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
									{validationErrorCount} {validationErrorCount === 1 ? 'error' : 'errors'}
								</span>
							{/if}
							{#if validationWarningCount > 0}
								<span class="rounded-full bg-yellow-500/10 px-2.5 py-0.5 text-xs font-medium text-yellow-700 dark:text-yellow-400">
									{validationWarningCount} {validationWarningCount === 1 ? 'warning' : 'warnings'}
								</span>
							{/if}
						</div>

						<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
							{#each validationErrors as error}
								<div class="rounded border px-2.5 py-1.5 text-xs {error.level === 'ERROR' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-yellow-500/30 bg-yellow-500/5 text-yellow-700 dark:text-yellow-400'}">
									<span class="font-medium">[{error.category}]</span>
									{error.message}
									{#if error.path}
										<span class="block text-[10px] opacity-70">{error.path}</span>
									{/if}
								</div>
							{/each}

						</div>
						<p class="mt-3 text-xs text-muted-foreground">Ideally you should never face issues like these, please <a href="https://github.com/OpenFilamentCollective/open-filament-database/issues" class="underline hover:text-foreground">submit an issue</a> with the above errors in the message body.</p>
					{:else if validationStatus === 'error'}
						<div class="rounded-md bg-destructive/10 p-2.5 text-sm text-destructive">
							{validationErrors[0]?.message || 'Validation failed'}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Save/Submit Section -->
			<div class="shrink-0">
				{#if $isLocalMode}
					<!-- Local mode: Save to Disk -->
					<div>
						<h4 class="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Save to Disk</h4>
						{#if saveResult?.success}
							<div class="rounded-md bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
								<p>{saveResult.message}</p>
							</div>
						{:else}
							<p class="mb-3 text-sm text-muted-foreground">
								Write all pending changes to the local data files. This will run validation and formatting automatically.
							</p>
							<Button onclick={saveToDisk} variant="primary" size="md" class="w-full" disabled={savingToDisk}>
								{#if savingToDisk}
									<svg class="mr-2 h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
										<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
										<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
									</svg>
									Saving to Disk...
								{:else}
									Save to Disk
								{/if}
							</Button>
							{#if saveResult && !saveResult.success}
								<div class="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
									<p>{saveResult.message}</p>
								</div>
							{/if}
						{/if}
					</div>
				{:else}
					<!-- Cloud mode: Submission Wizard -->
					<SubmissionWizard
						{validationStatus}
						{validationIsValid}
						{validationErrorCount}
						{validationWarningCount}
						onSubmitSimplyPrint={submitSimplyPrintForWizard}
						onSubmitGitHub={createPRForWizard}
						onClose={() => { submitModalOpen = false; reopenedAfterAuth = false; cleanupValidationStream(); }}
						initialMethod={reopenedAfterAuth || undefined}
					/>
				{/if}
			</div>
		{/snippet}

		{#snippet rightContent()}
			<!-- Header: validation status + stats + download JSON -->
			<div class="mb-4 flex flex-wrap items-center gap-2 text-sm">
				<div class="flex flex-1 flex-wrap items-center gap-2">
					{#if validationStatus === 'running'}
						<span class="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
							<LoadingSpinner />
							Validating...
						</span>
					{:else if validationStatus === 'complete'}
						{#if validationIsValid}
							<span class="rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">Valid</span>
						{:else}
							<span class="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
								{validationErrorCount} {validationErrorCount === 1 ? 'error' : 'errors'}{#if validationWarningCount > 0}, {validationWarningCount} {validationWarningCount === 1 ? 'warning' : 'warnings'}{/if}
							</span>
						{/if}
					{:else if validationStatus === 'error'}
						<span class="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">Validation failed</span>
					{:else}
						<span class="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">Not validated</span>
					{/if}
					<span class="text-xs text-muted-foreground">
						{detailedSummary.join(', ')}
					</span>
				</div>
				<Button onclick={exportChanges} variant="ghost" size="sm" class="shrink-0 text-muted-foreground">
					<svg xmlns="http://www.w3.org/2000/svg" class="mr-1.5 h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
					</svg>
					Download JSON
				</Button>
			</div>

			<!-- Change list -->
			<div class="flex-1 overflow-y-auto space-y-3">
				{#each $changesList as change}
					{@const badge = getOperationBadge(change.operation)}
					<div class="rounded-lg border p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0 flex-1">
								<div class="flex items-center gap-2">
									<span class="rounded px-1.5 py-0.5 text-xs font-medium {badge.bg} {badge.text}">
										{badge.label}
									</span>
									<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
										{change.entity.type}
									</span>
									<span class="text-xs text-muted-foreground">
										{formatTimestamp(change.timestamp)}
									</span>
								</div>
								<p class="mt-1 text-sm font-medium">{change.description}</p>
								<p class="text-xs text-muted-foreground">{change.entity.path}</p>
							</div>
						</div>

						{#if change.propertyChanges && change.propertyChanges.length > 0}
							<div class="mt-3 space-y-2 rounded border bg-muted/50 p-3 text-xs">
								{#each change.propertyChanges as propChange}
									<div>
										<span class="font-medium">{propChange.property}</span>
										{#if propChange.oldValue === undefined}
											<span class="ml-1 text-green-600 dark:text-green-400">added</span>
											<pre class="mt-1 overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
										{:else if propChange.newValue === undefined}
											<span class="ml-1 text-destructive">removed</span>
											<pre class="mt-1 overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
										{:else}
											<div class="mt-1 grid gap-1">
												<pre class="overflow-x-auto rounded bg-destructive/10 p-1.5 text-destructive line-through">{formatValue(propChange.oldValue)}</pre>
												<pre class="overflow-x-auto rounded bg-green-500/10 p-1.5 text-green-700 dark:text-green-400">{formatValue(propChange.newValue)}</pre>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/snippet}
	</TwoColumnLayout>
	</div>
</Modal>
