<script lang="ts">
	let { data } = $props();
	let api = $derived(data.apiData);
	let baseUrl = $derived(data.baseUrl);
</script>

<svelte:head>
	<title>API Documentation - Open Filament Database</title>
</svelte:head>

<div class="container mx-auto px-6 py-10">
	<!-- Hero -->
	<header class="mb-10">
		<h1 class="mb-2 text-3xl font-bold tracking-tight">Open Filament Database API</h1>
		<p class="text-lg text-muted-foreground">
			The dataset is rebuilt daily and published as static JSON, CSV, and SQLite files.
			All data is validated against JSON Schema Draft-07 schemas served from the API itself.
		</p>
		<div class="mt-4 flex flex-wrap gap-3">
			<a
				href="https://github.com/OpenFilamentCollective/open-filament-database"
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				Source Repository
			</a>
			{#if baseUrl}
				<a
					href="{baseUrl}/api/v1/index.json"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center rounded-md border bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
				>
					API Root
				</a>
			{/if}
			{#if api}
				<span class="flex items-center text-sm text-muted-foreground">v{api.version}</span>
			{/if}
		</div>
	</header>

	{#if !baseUrl}
		<div class="rounded-lg border-l-4 border-warning bg-warning/10 p-4">
			<p class="text-sm text-muted-foreground">API documentation is only available when <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">PUBLIC_API_BASE_URL</code> is configured.</p>
		</div>
	{:else if !api}
		<div class="rounded-lg border-l-4 border-destructive bg-destructive/10 p-4">
			<p class="text-destructive">Could not fetch API data from {baseUrl}.</p>
		</div>
	{:else}
		<!-- How it works -->
		<section class="mb-8 rounded-lg border bg-card p-6 shadow-sm">
			<h2 class="mb-3 text-xl font-semibold">How it Works</h2>
			<div class="space-y-2 text-sm text-muted-foreground">
				<p>The Open Filament Database is a <strong class="text-foreground">static dataset</strong> rebuilt daily from source YAML files. There is no dynamic server &mdash; the API is a collection of pre-built JSON files served from GitHub Pages.</p>
				<p>The <strong class="text-foreground">entity hierarchy</strong> is: Brands &rarr; Materials &rarr; Filaments &rarr; Variants (with Sizes). Stores are independent entities.</p>
				<p>Every entity type has a corresponding <strong class="text-foreground">JSON Schema</strong> available at <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">/schemas/</code>. Schemas include custom <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">x-</code> extension properties (<code class="rounded bg-secondary px-1.5 py-0.5 text-xs">x-category</code>, <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">x-label</code>, <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">x-description</code>) that this editor uses to dynamically build its UI.</p>
				<p>Contributions are made through this web editor: browse the data, make edits, and submit &mdash; changes are validated against the schemas and reviewed by a maintainer.</p>
			</div>
		</section>

		<!-- Dataset Statistics -->
		<section class="mb-8 rounded-lg border bg-card p-6 shadow-sm">
			<div class="mb-1 flex items-baseline justify-between">
				<h2 class="text-xl font-semibold">Dataset Statistics</h2>
				<span class="text-xs text-muted-foreground">Generated: {api.generated_at}</span>
			</div>
			<div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
				{#each [
					[api.stats.brands, 'Brands'],
					[api.stats.materials, 'Materials'],
					[api.stats.filaments, 'Filaments'],
					[api.stats.variants, 'Variants'],
					[api.stats.sizes, 'Sizes'],
					[api.stats.stores, 'Stores']
				] as [value, label]}
					<div class="rounded-lg border bg-background p-4 text-center">
						<div class="text-2xl font-bold text-primary">{value}</div>
						<div class="mt-1 text-xs text-muted-foreground">{label}</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- API Endpoints -->
		<section class="mb-8 rounded-lg border bg-card p-6 shadow-sm">
			<h2 class="mb-1 text-xl font-semibold">API Endpoints</h2>
			<p class="mb-5 text-sm text-muted-foreground">All responses are static JSON files rebuilt daily. Base URL: <code class="rounded bg-secondary px-1.5 py-0.5 text-xs">/api/v1/</code></p>

			<h3 class="mb-2 text-base font-semibold">Brands</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/brands/index.json</code>
					<span class="text-sm text-muted-foreground">List all brands with material counts</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/brands/{'{slug}'}/index.json</code>
					<span class="text-sm text-muted-foreground">Brand details with nested materials, filaments, and variants</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Materials & Filaments</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/brands/{'{brand}'}/materials/{'{material}'}/index.json</code>
					<span class="text-sm text-muted-foreground">Material with its filaments</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/.../filaments/{'{filament}'}/index.json</code>
					<span class="text-sm text-muted-foreground">Filament with slicer settings and variants</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/.../variants/{'{variant}'}.json</code>
					<span class="text-sm text-muted-foreground">Color variant with sizes and purchase links</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Stores</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/stores/index.json</code>
					<span class="text-sm text-muted-foreground">List all stores</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/stores/{'{slug}'}.json</code>
					<span class="text-sm text-muted-foreground">Store details with location and contact info</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Logos</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/brands/logo/index.json</code>
					<span class="text-sm text-muted-foreground">All brand logo metadata</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/brands/logo/{'{id}'}.{'{ext}'}</code>
					<span class="text-sm text-muted-foreground">Brand logo image (PNG, JPG, SVG)</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/stores/logo/index.json</code>
					<span class="text-sm text-muted-foreground">All store logo metadata</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/stores/logo/{'{id}'}.{'{ext}'}</code>
					<span class="text-sm text-muted-foreground">Store logo image (PNG, JPG, SVG)</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Schemas</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/schemas/index.json</code>
					<span class="text-sm text-muted-foreground">Schema index listing all available schemas</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/schemas/{'{name}'}.json</code>
					<span class="text-sm text-muted-foreground">Individual schema (JSON Schema Draft-07 with x- extensions)</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Badges</h3>
			<div class="mb-5 divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/badges/{'{name}'}.svg</code>
					<span class="text-sm text-muted-foreground">SVG count badges (brands, filaments, variants, stores)</span>
				</div>
			</div>

			<h3 class="mb-2 text-base font-semibold">Bulk Downloads</h3>
			<div class="divide-y rounded-lg border">
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/json/all.json</code>
					<span class="text-sm text-muted-foreground">Complete dataset as a single JSON file</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/json/all.json.gz</code>
					<span class="text-sm text-muted-foreground">Gzipped JSON</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/json/all.ndjson</code>
					<span class="text-sm text-muted-foreground">Newline-delimited JSON (one record per line)</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/csv/{'{entity}'}.csv</code>
					<span class="text-sm text-muted-foreground">CSV exports (brands, filaments, materials, variants, sizes, stores, purchase_links)</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/sqlite/filaments.db</code>
					<span class="text-sm text-muted-foreground">SQLite database (filament data)</span>
				</div>
				<div class="flex items-center gap-3 px-4 py-2.5">
					<span class="rounded bg-green-500/15 px-2 py-0.5 text-xs font-semibold text-green-600 dark:text-green-400">GET</span>
					<code class="text-sm">/sqlite/stores.db</code>
					<span class="text-sm text-muted-foreground">SQLite database (store data)</span>
				</div>
			</div>
		</section>

		<!-- Examples -->
		<section class="mb-8 rounded-lg border bg-card p-6 shadow-sm">
			<h2 class="mb-5 text-xl font-semibold">Examples</h2>

			<h3 class="mb-2 text-base font-semibold">curl</h3>
			<pre class="mb-5 overflow-x-auto rounded-lg border bg-secondary p-4 text-sm"><code>curl {baseUrl}/api/v1/brands/index.json</code></pre>

			<h3 class="mb-2 text-base font-semibold">JavaScript</h3>
			<pre class="mb-5 overflow-x-auto rounded-lg border bg-secondary p-4 text-sm"><code><span class="text-purple-600 dark:text-purple-400">const</span> res = <span class="text-purple-600 dark:text-purple-400">await</span> <span class="text-blue-600 dark:text-blue-400">fetch</span>(<span class="text-green-600 dark:text-green-400">'{baseUrl}/api/v1/brands/index.json'</span>);
<span class="text-purple-600 dark:text-purple-400">const</span> data = <span class="text-purple-600 dark:text-purple-400">await</span> res.<span class="text-blue-600 dark:text-blue-400">json</span>();
console.<span class="text-blue-600 dark:text-blue-400">log</span>(<span class="text-green-600 dark:text-green-400">`$&#123;data.count&#125; brands`</span>);</code></pre>

			<h3 class="mb-2 text-base font-semibold">Python</h3>
			<pre class="overflow-x-auto rounded-lg border bg-secondary p-4 text-sm"><code><span class="text-purple-600 dark:text-purple-400">import</span> requests
brands = requests.<span class="text-blue-600 dark:text-blue-400">get</span>(<span class="text-green-600 dark:text-green-400">'{baseUrl}/api/v1/brands/index.json'</span>).<span class="text-blue-600 dark:text-blue-400">json</span>()
<span class="text-purple-600 dark:text-purple-400">for</span> b <span class="text-purple-600 dark:text-purple-400">in</span> brands[<span class="text-green-600 dark:text-green-400">'brands'</span>]:
    <span class="text-blue-600 dark:text-blue-400">print</span>(<span class="text-green-600 dark:text-green-400">f"&#123;b['name']&#125;: &#123;b['material_count']&#125; materials"</span>)</code></pre>
		</section>

		<!-- File Browser -->
		<section class="rounded-lg border bg-card p-6 shadow-sm">
			<h2 class="mb-5 text-xl font-semibold">File Browser</h2>
			<div class="file-tree text-sm">
				<ul class="space-y-0.5">
					<!-- API -->
					<li>
						<details open>
							<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">api/</summary>
							<ul class="ml-4 border-l pl-3">
								<li>
									<details open>
										<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">v1/</summary>
										<ul class="ml-4 border-l pl-3">
											<li>
												<details>
													<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">badges/</summary>
													<ul class="ml-4 border-l pl-3">
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/badges/brands.svg" class="text-primary hover:underline">brands.svg</a></li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/badges/filaments.svg" class="text-primary hover:underline">filaments.svg</a></li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/badges/variants.svg" class="text-primary hover:underline">variants.svg</a></li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/badges/stores.svg" class="text-primary hover:underline">stores.svg</a></li>
													</ul>
												</details>
											</li>
											<li>
												<details>
													<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">brands/</summary>
													<ul class="ml-4 border-l pl-3">
														<li class="px-2 py-0.5 text-muted-foreground">{'{brand-slug}'}/</li>
														<li>
															<details>
																<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">logo/</summary>
																<ul class="ml-4 border-l pl-3">
																	<li class="px-2 py-0.5 text-muted-foreground">{'{logo-id}'}.json</li>
																	<li class="px-2 py-0.5 text-muted-foreground">{'{logo-id}'}.{'{ext}'}</li>
																	<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/brands/logo/index.json" class="text-primary hover:underline">index.json</a></li>
																</ul>
															</details>
														</li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/brands/index.json" class="text-primary hover:underline">index.json</a></li>
													</ul>
												</details>
											</li>
											<li>
												<details>
													<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">stores/</summary>
													<ul class="ml-4 border-l pl-3">
														<li class="px-2 py-0.5 text-muted-foreground">{'{store-slug}'}.json</li>
														<li>
															<details>
																<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">logo/</summary>
																<ul class="ml-4 border-l pl-3">
																	<li class="px-2 py-0.5 text-muted-foreground">{'{logo-id}'}.json</li>
																	<li class="px-2 py-0.5 text-muted-foreground">{'{logo-id}'}.{'{ext}'}</li>
																	<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/stores/logo/index.json" class="text-primary hover:underline">index.json</a></li>
																</ul>
															</details>
														</li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/stores/index.json" class="text-primary hover:underline">index.json</a></li>
													</ul>
												</details>
											</li>
											<li>
												<details>
													<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">schemas/</summary>
													<ul class="ml-4 border-l pl-3">
														<li class="px-2 py-0.5 text-muted-foreground">{'{name}'}.json</li>
														<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/schemas/index.json" class="text-primary hover:underline">index.json</a></li>
													</ul>
												</details>
											</li>
											<li class="px-2 py-0.5"><a href="{baseUrl}/api/v1/index.json" class="text-primary hover:underline">index.json</a></li>
										</ul>
									</details>
								</li>
							</ul>
						</details>
					</li>
					<!-- CSV -->
					<li>
						<details>
							<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">csv/</summary>
							<ul class="ml-4 border-l pl-3">
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/brands.csv" class="text-primary hover:underline">brands.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/filaments.csv" class="text-primary hover:underline">filaments.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/materials.csv" class="text-primary hover:underline">materials.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/purchase_links.csv" class="text-primary hover:underline">purchase_links.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/sizes.csv" class="text-primary hover:underline">sizes.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/stores.csv" class="text-primary hover:underline">stores.csv</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/csv/variants.csv" class="text-primary hover:underline">variants.csv</a></li>
							</ul>
						</details>
					</li>
					<!-- JSON -->
					<li>
						<details>
							<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">json/</summary>
							<ul class="ml-4 border-l pl-3">
								<li>
									<details>
										<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">brands/</summary>
										<ul class="ml-4 border-l pl-3">
											<li class="px-2 py-0.5 text-muted-foreground">{'{brand-slug}'}.json</li>
											<li class="px-2 py-0.5"><a href="{baseUrl}/json/brands/index.json" class="text-primary hover:underline">index.json</a></li>
										</ul>
									</details>
								</li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/json/all.json" class="text-primary hover:underline">all.json</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/json/all.json.gz" class="text-primary hover:underline">all.json.gz</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/json/all.ndjson" class="text-primary hover:underline">all.ndjson</a></li>
							</ul>
						</details>
					</li>
					<!-- SQLite -->
					<li>
						<details>
							<summary class="cursor-pointer rounded px-2 py-1 font-medium hover:bg-accent">sqlite/</summary>
							<ul class="ml-4 border-l pl-3">
								<li class="px-2 py-0.5"><a href="{baseUrl}/sqlite/filaments.db" class="text-primary hover:underline">filaments.db</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/sqlite/filaments.db.xz" class="text-primary hover:underline">filaments.db.xz</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/sqlite/stores.db" class="text-primary hover:underline">stores.db</a></li>
								<li class="px-2 py-0.5"><a href="{baseUrl}/sqlite/stores.db.xz" class="text-primary hover:underline">stores.db.xz</a></li>
							</ul>
						</details>
					</li>
					<!-- Manifest -->
					<li class="px-2 py-0.5"><a href="{baseUrl}/manifest.json" class="text-primary hover:underline">manifest.json</a></li>
				</ul>
			</div>
		</section>
	{/if}
</div>
