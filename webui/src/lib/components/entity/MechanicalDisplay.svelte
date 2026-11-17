<script lang="ts">
	/**
	 * Read-only view of a filament's mechanical properties: one row per property (and
	 * standard and condition), print directions side by side. Every value is shown as
	 * published, with its ± and unit, because a modulus in psi or an XY-only figure is
	 * easy to compare against the wrong thing. Each value links to its source, with the
	 * quote as its tooltip; the quotes and test details are listed below the table.
	 */
	import type { MechanicalProperty, PrintDirection } from '$lib/types/database';
	import { enumLabel } from '$lib/utils/sustainability';
	import {
		formatMechanicalValue,
		groupMechanical,
		propertyLabel,
		specimenSummary
	} from '$lib/utils/mechanical';

	interface Props {
		mechanical?: MechanicalProperty[];
	}

	let { mechanical }: Props = $props();

	const DIRECTION_LABELS: Record<PrintDirection, string> = {
		XY: 'XY',
		XZ: 'XZ',
		Z: 'Z',
		unknown: 'Direction not stated'
	};

	const DIRECTION_TITLES: Record<PrintDirection, string> = {
		XY: 'Printed flat, along the layers',
		XZ: 'Printed on edge',
		Z: 'Printed upright, across the layers',
		unknown: 'The source gives no print direction (always so for moulded bars)'
	};

	let table = $derived(groupMechanical(mechanical));

	// Quotes grouped by source, in table order, so one data sheet is listed once.
	let sources = $derived.by(() => {
		const groups: { url: string; entries: MechanicalProperty[] }[] = [];
		for (const row of table.rows) {
			for (const direction of table.directions) {
				for (const entry of row.cells[direction] ?? []) {
					const group = groups.find((g) => g.url === entry.source_url);
					if (group) group.entries.push(entry);
					else groups.push({ url: entry.source_url, entries: [entry] });
				}
			}
		}
		return groups.map(({ url, entries }) => ({
			url,
			entries,
			secondary: entries.some((e) => e.source_type === 'secondary'),
			retrieved: [...new Set(entries.map((e) => e.retrieved))].join(', ')
		}));
	});

	function rowDetail(standard?: string | null, condition?: string): string {
		return [standard, condition ? enumLabel(condition) : null].filter(Boolean).join(' · ');
	}
</script>

<div class="text-sm">
	<div class="overflow-x-auto">
		<table class="w-full">
			<thead>
				<tr class="border-b text-left text-xs text-muted-foreground">
					<th class="py-1 pr-3 font-medium">Property</th>
					{#each table.directions as direction (direction)}
						<th class="py-1 pr-3 font-medium" title={DIRECTION_TITLES[direction]}>
							{DIRECTION_LABELS[direction]}
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each table.rows as row, r (r)}
					<tr class="border-b align-top last:border-0">
						<td class="py-1.5 pr-3">
							<div class="font-medium">{propertyLabel(row.property)}</div>
							{#if row.standard || row.condition}
								<div class="text-xs text-muted-foreground">
									{rowDetail(row.standard, row.condition)}
								</div>
							{/if}
						</td>
						{#each table.directions as direction (direction)}
							<td class="py-1.5 pr-3 whitespace-nowrap">
								{#each row.cells[direction] ?? [] as entry, k (k)}
									<div>
										<!-- eslint-disable svelte/no-navigation-without-resolve -- external source link -->
										<a
											href={entry.source_url}
											target="_blank"
											rel="noopener noreferrer"
											title="“{entry.source_quote}”"
											class="underline decoration-muted-foreground/40 decoration-dotted underline-offset-2 hover:decoration-solid"
											>{formatMechanicalValue(entry)}</a
										>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
										{#if entry.specimen?.process === 'moulded'}
											<span class="text-xs text-muted-foreground">(moulded)</span>
										{/if}
									</div>
								{:else}
									<span class="text-muted-foreground">–</span>
								{/each}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<details class="mt-2 text-xs">
		<summary class="cursor-pointer text-muted-foreground">Sources and test details</summary>
		{#each sources as { url, entries, secondary, retrieved } (url)}
			<div class="mt-2">
				<!-- eslint-disable svelte/no-navigation-without-resolve -- external source link -->
				<a
					href={url}
					target="_blank"
					rel="noopener noreferrer"
					class="break-all text-primary hover:underline"
				>
					{url}
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<span class="text-muted-foreground">
					{secondary ? '(secondary), ' : ''}retrieved {retrieved}
				</span>
				<ul class="mt-1 space-y-1.5">
					{#each entries as entry, k (k)}
						<li>
							<span class="font-medium">
								{propertyLabel(entry.property)}{entry.direction === 'unknown'
									? ''
									: ` ${entry.direction}`}: {formatMechanicalValue(entry)}
							</span>
							<blockquote class="mt-0.5 border-l-2 pl-2 text-muted-foreground italic">
								“{entry.source_quote}”
							</blockquote>
							{#if specimenSummary(entry.specimen)}
								<p class="text-muted-foreground">{specimenSummary(entry.specimen)}</p>
							{/if}
							{#if entry.notes}<p class="text-muted-foreground">{entry.notes}</p>{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</details>
</div>
