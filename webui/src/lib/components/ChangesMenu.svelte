<script lang="ts">
	import { changeStore, changeCount, hasChanges, changesList } from '$lib/stores/changes';
	import { isCloudMode } from '$lib/stores/environment';
	import type { EntityChange } from '$lib/types/changes';

	let menuOpen = false;

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	function closeMenu() {
		menuOpen = false;
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

	function getOperationColor(operation: EntityChange['operation']): string {
		switch (operation) {
			case 'create':
				return 'text-green-600 dark:text-green-400';
			case 'update':
				return 'text-blue-600 dark:text-blue-400';
			case 'delete':
				return 'text-red-600 dark:text-red-400';
			default:
				return 'text-gray-600 dark:text-gray-400';
		}
	}

	function getOperationIcon(operation: EntityChange['operation']): string {
		switch (operation) {
			case 'create':
				return '➕';
			case 'update':
				return '✏️';
			case 'delete':
				return '🗑️';
			default:
				return '📝';
		}
	}

	function undoChange(entityPath: string) {
		if (confirm('Are you sure you want to undo this change?')) {
			changeStore.removeChange(entityPath);
		}
	}

	async function exportChanges() {
		const exportData = changeStore.exportChanges();
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
		}
	}
</script>

{#if $isCloudMode}
	<div class="changes-menu-container">
		<!-- Button to open menu -->
		<button
			on:click={toggleMenu}
			class="changes-button"
			class:has-changes={$hasChanges}
			title={$hasChanges ? `${$changeCount} pending changes` : 'No pending changes'}
		>
			<span class="icon">📝</span>
			{#if $hasChanges}
				<span class="badge">{$changeCount}</span>
			{/if}
		</button>

		<!-- Dropdown menu -->
		{#if menuOpen}
			<div class="menu-backdrop" on:click={closeMenu} role="button" tabindex="-1"></div>
			<div class="menu-panel">
				<div class="menu-header">
					<h3>Pending Changes</h3>
					<button on:click={closeMenu} class="close-button" title="Close">✕</button>
				</div>

				<div class="menu-content">
					{#if $hasChanges}
						<div class="changes-list">
							{#each $changesList as change}
								<div class="change-item">
									<div class="change-header">
										<span class="operation-icon">{getOperationIcon(change.operation)}</span>
										<span class={`operation-text ${getOperationColor(change.operation)}`}>
											{change.operation.toUpperCase()}
										</span>
										<span class="entity-type">{change.entity.type}</span>
										<span class="timestamp">{formatTimestamp(change.timestamp)}</span>
									</div>
									<div class="change-description">{change.description}</div>
									<div class="change-path">{change.entity.path}</div>

									{#if change.propertyChanges && change.propertyChanges.length > 0}
										<div class="property-changes">
											<details>
												<summary>{change.propertyChanges.length} property changes</summary>
												<ul>
													{#each change.propertyChanges as propChange}
														<li>
															<code>{propChange.property}</code>:
															{#if propChange.oldValue === undefined}
																<span class="text-green-600">added</span>
															{:else if propChange.newValue === undefined}
																<span class="text-red-600">removed</span>
															{:else}
																changed
															{/if}
														</li>
													{/each}
												</ul>
											</details>
										</div>
									{/if}

									<button
										on:click={() => undoChange(change.entity.path)}
										class="undo-button"
										title="Undo this change"
									>
										Undo
									</button>
								</div>
							{/each}
						</div>

						<div class="menu-actions">
							<button on:click={exportChanges} class="action-button export-button">
								Export as JSON
							</button>
							<button on:click={clearAllChanges} class="action-button clear-button">
								Clear All
							</button>
						</div>
					{:else}
						<div class="empty-state">
							<p>No pending changes</p>
							<p class="empty-hint">
								Changes you make in cloud mode will be tracked here and can be exported as JSON.
							</p>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.changes-menu-container {
		position: relative;
	}

	.changes-button {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.changes-button:hover {
		background: #f9fafb;
		border-color: #d1d5db;
	}

	.changes-button.has-changes {
		border-color: #3b82f6;
		color: #3b82f6;
	}

	.changes-button .icon {
		font-size: 1.25rem;
	}

	.badge {
		position: absolute;
		top: -0.25rem;
		right: -0.25rem;
		background: #ef4444;
		color: white;
		border-radius: 9999px;
		padding: 0.125rem 0.375rem;
		font-size: 0.75rem;
		font-weight: 600;
		line-height: 1;
		min-width: 1.25rem;
		text-align: center;
	}

	.menu-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.3);
		z-index: 1001;
	}

	.menu-panel {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		width: 28rem;
		max-width: 90vw;
		max-height: 80vh;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 0.5rem;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		z-index: 1002;
	}

	.menu-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.menu-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: #111827;
	}

	.close-button {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #6b7280;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.2s;
	}

	.close-button:hover {
		color: #111827;
	}

	.menu-content {
		flex: 1;
		overflow-y: auto;
		padding: 0.5rem;
	}

	.changes-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.change-item {
		position: relative;
		padding: 0.75rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
		font-size: 0.875rem;
	}

	.change-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.operation-icon {
		font-size: 1rem;
	}

	.operation-text {
		font-weight: 600;
		font-size: 0.75rem;
	}

	.entity-type {
		background: #e5e7eb;
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #4b5563;
		text-transform: uppercase;
		font-weight: 500;
	}

	.timestamp {
		margin-left: auto;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.change-description {
		margin-bottom: 0.25rem;
		color: #111827;
		font-weight: 500;
	}

	.change-path {
		font-family: 'Courier New', monospace;
		font-size: 0.75rem;
		color: #6b7280;
		margin-bottom: 0.5rem;
	}

	.property-changes {
		margin-top: 0.5rem;
		font-size: 0.75rem;
	}

	.property-changes details {
		background: white;
		padding: 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid #e5e7eb;
	}

	.property-changes summary {
		cursor: pointer;
		font-weight: 500;
		color: #4b5563;
	}

	.property-changes ul {
		margin-top: 0.5rem;
		padding-left: 1.5rem;
		list-style: disc;
	}

	.property-changes li {
		margin-top: 0.25rem;
	}

	.property-changes code {
		background: #f3f4f6;
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: 'Courier New', monospace;
	}

	.undo-button {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: white;
		border: 1px solid #e5e7eb;
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: #6b7280;
		cursor: pointer;
		transition: all 0.2s;
	}

	.undo-button:hover {
		background: #fee2e2;
		border-color: #fecaca;
		color: #dc2626;
	}

	.menu-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		border-top: 1px solid #e5e7eb;
		margin-top: 0.5rem;
	}

	.action-button {
		flex: 1;
		padding: 0.5rem 1rem;
		border: 1px solid;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.export-button {
		background: #3b82f6;
		border-color: #3b82f6;
		color: white;
	}

	.export-button:hover {
		background: #2563eb;
		border-color: #2563eb;
	}

	.clear-button {
		background: white;
		border-color: #ef4444;
		color: #ef4444;
	}

	.clear-button:hover {
		background: #fef2f2;
	}

	.empty-state {
		text-align: center;
		padding: 2rem;
		color: #6b7280;
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: #9ca3af;
	}

	/* Dark mode support */
	@media (prefers-color-scheme: dark) {
		.changes-button {
			background: #1f2937;
			border-color: #374151;
			color: #9ca3af;
		}

		.changes-button:hover {
			background: #374151;
			border-color: #4b5563;
		}

		.menu-panel {
			background: #1f2937;
			border-color: #374151;
		}

		.menu-header {
			border-bottom-color: #374151;
		}

		.menu-header h3 {
			color: #f9fafb;
		}

		.change-item {
			background: #111827;
			border-color: #374151;
		}

		.change-description {
			color: #f9fafb;
		}

		.entity-type {
			background: #374151;
			color: #9ca3af;
		}

		.property-changes details {
			background: #1f2937;
			border-color: #374151;
		}

		.undo-button {
			background: #1f2937;
			border-color: #374151;
			color: #9ca3af;
		}

		.undo-button:hover {
			background: #7f1d1d;
			border-color: #991b1b;
			color: #fca5a5;
		}

		.action-button.clear-button {
			background: #1f2937;
		}

		.action-button.clear-button:hover {
			background: #7f1d1d;
		}
	}
</style>
