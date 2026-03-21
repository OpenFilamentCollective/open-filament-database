<script lang="ts">
	import { debugLog, debugEnabled, type LogEntry } from '$lib/stores/debugLog';

	let open = $state(false);
	let filter: LogEntry['level'] | 'all' = $state('all');
	let autoScroll = $state(true);
	let panel: HTMLElement | undefined = $state();

	let filtered = $derived(
		filter === 'all' ? $debugLog : $debugLog.filter((e) => e.level === filter)
	);

	let unreadErrors = $derived(
		$debugLog.filter((e) => e.level === 'error').length
	);

	$effect(() => {
		// Trigger on filtered changes
		filtered;
		if (autoScroll && panel) {
			requestAnimationFrame(() => {
				panel!.scrollTop = panel!.scrollHeight;
			});
		}
	});

	function clear() {
		debugLog.set([]);
	}

	function levelColor(level: LogEntry['level']): string {
		switch (level) {
			case 'error': return 'text-red-400';
			case 'warn': return 'text-yellow-400';
			case 'info': return 'text-blue-400';
			case 'debug': return 'text-gray-400';
			default: return 'text-green-300';
		}
	}

	function formatTime(ts: number): string {
		const d = new Date(ts);
		return d.toLocaleTimeString('en-GB', { hour12: false, fractionalSecondDigits: 3 });
	}
</script>

{#if debugEnabled}
	<!-- Toggle button -->
	<button
		onclick={() => open = !open}
		class="fixed bottom-4 right-4 z-[9999] flex items-center gap-1 rounded-full bg-gray-900 px-3 py-1.5 text-xs font-mono text-gray-300 shadow-lg border border-gray-700 hover:bg-gray-800 transition-colors"
		title="Toggle debug console"
	>
		<span class="text-green-400">DBG</span>
		{#if unreadErrors > 0}
			<span class="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] text-white">{unreadErrors}</span>
		{/if}
	</button>

	<!-- Panel -->
	{#if open}
		<div class="fixed bottom-12 right-4 z-[9998] flex w-[600px] max-w-[90vw] flex-col rounded-lg border border-gray-700 bg-gray-950 shadow-2xl" style="max-height: 50vh;">
			<!-- Header -->
			<div class="flex items-center justify-between border-b border-gray-800 px-3 py-2">
				<div class="flex items-center gap-2">
					<span class="text-xs font-mono font-bold text-gray-300">Console</span>
					<span class="text-[10px] text-gray-500">{filtered.length} entries</span>
				</div>
				<div class="flex items-center gap-2">
					<!-- Level filter -->
					{#each ['all', 'error', 'warn', 'info', 'log', 'debug'] as lvl}
						<button
							onclick={() => filter = lvl as any}
							class="rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors {filter === lvl ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}"
						>{lvl}</button>
					{/each}
					<button onclick={() => autoScroll = !autoScroll} class="text-[10px] font-mono {autoScroll ? 'text-blue-400' : 'text-gray-600'}" title="Auto-scroll">
						{autoScroll ? '⬇' : '⏸'}
					</button>
					<button onclick={clear} class="text-[10px] font-mono text-gray-500 hover:text-gray-300" title="Clear">CLR</button>
				</div>
			</div>

			<!-- Log entries -->
			<div bind:this={panel} class="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed" style="min-height: 100px;">
				{#if filtered.length === 0}
					<p class="text-gray-600 text-center py-4">No log entries</p>
				{:else}
					{#each filtered as entry}
						<div class="flex gap-2 border-b border-gray-900 py-0.5 hover:bg-gray-900/50">
							<span class="shrink-0 text-gray-600">{formatTime(entry.timestamp)}</span>
							<span class="shrink-0 w-10 text-right {levelColor(entry.level)}">{entry.level.toUpperCase().padStart(5)}</span>
							<span class="text-gray-300 whitespace-pre-wrap break-all">{entry.args.join(' ')}</span>
						</div>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
{/if}
