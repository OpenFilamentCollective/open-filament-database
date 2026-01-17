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
				return 'text-primary dark:text-primary';
			case 'delete':
				return 'text-destructive dark:text-destructive';
			default:
				return 'text-muted-foreground dark:text-muted-foreground';
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
																<span class="text-destructive">removed</span>
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
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		cursor: pointer;
		transition: all 0.2s;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	.changes-button:hover {
		background: hsl(var(--muted));
		border-color: hsl(var(--border));
	}

	.changes-button.has-changes {
		border-color: hsl(var(--primary));
		color: hsl(var(--primary));
	}

	.changes-button .icon {
		font-size: 1.25rem;
	}

	.badge {
		position: absolute;
		top: -0.25rem;
		right: -0.25rem;
		background: hsl(var(--destructive));
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
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
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
		border-bottom: 1px solid hsl(var(--border));
	}

	.menu-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.close-button {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: color 0.2s;
	}

	.close-button:hover {
		color: hsl(var(--foreground));
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
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
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
		background: hsl(var(--secondary));
		padding: 0.125rem 0.375rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		font-weight: 500;
	}

	.timestamp {
		margin-left: auto;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.change-description {
		margin-bottom: 0.25rem;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.change-path {
		font-family: 'Courier New', monospace;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.5rem;
	}

	.property-changes {
		margin-top: 0.5rem;
		font-size: 0.75rem;
	}

	.property-changes details {
		background: hsl(var(--background));
		padding: 0.5rem;
		border-radius: 0.25rem;
		border: 1px solid hsl(var(--border));
	}

	.property-changes summary {
		cursor: pointer;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
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
		background: hsl(var(--muted));
		padding: 0.125rem 0.25rem;
		border-radius: 0.25rem;
		font-family: 'Courier New', monospace;
	}

	.undo-button {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		padding: 0.25rem 0.5rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
	}

	.undo-button:hover {
		background: hsl(var(--destructive) / 0.1);
		border-color: hsl(var(--destructive) / 0.3);
		color: hsl(var(--destructive));
	}

	.menu-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.5rem;
		border-top: 1px solid hsl(var(--border));
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
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.export-button:hover {
		background: hsl(var(--primary) / 0.9);
		border-color: hsl(var(--primary) / 0.9);
	}

	.clear-button {
		background: hsl(var(--background));
		border-color: hsl(var(--destructive));
		color: hsl(var(--destructive));
	}

	.clear-button:hover {
		background: hsl(var(--destructive) / 0.1);
	}

	.empty-state {
		text-align: center;
		padding: 2rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-state p {
		margin: 0.5rem 0;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
</style>
