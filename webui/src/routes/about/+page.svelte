<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>About - Open Filament Database</title>
</svelte:head>

<div class="space-y-8">
	<div class="text-center">
		<h1 class="text-4xl font-bold text-gray-900 dark:text-white">About</h1>
		<p class="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400">
			A community-driven, open-source database for 3D printing filaments
		</p>
	</div>

	<!-- Database Stats -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Database Statistics</h2>
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div class="rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
				<p class="text-2xl font-bold text-blue-600 dark:text-blue-400">{data.stats.brands}</p>
				<p class="text-sm text-gray-600 dark:text-gray-400">Brands</p>
			</div>
			<div class="rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
				<p class="text-2xl font-bold text-green-600 dark:text-green-400">{data.stats.materials}</p>
				<p class="text-sm text-gray-600 dark:text-gray-400">Materials</p>
			</div>
			<div class="rounded-lg bg-purple-50 p-4 dark:bg-purple-900/20">
				<p class="text-2xl font-bold text-purple-600 dark:text-purple-400">{data.stats.filaments}</p>
				<p class="text-sm text-gray-600 dark:text-gray-400">Filaments</p>
			</div>
			<div class="rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
				<p class="text-2xl font-bold text-orange-600 dark:text-orange-400">{data.stats.variants}</p>
				<p class="text-sm text-gray-600 dark:text-gray-400">Color Variants</p>
			</div>
		</div>
	</div>

	<!-- Project Info -->
	<div class="grid gap-6 md:grid-cols-2">
		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">What is this?</h2>
			<div class="space-y-3 text-gray-600 dark:text-gray-400">
				<p>
					The Open Filament Database is a comprehensive, community-maintained repository of 3D printing filament data. Our goal is to provide accurate, standardized information about filaments from manufacturers around the world.
				</p>
				<p>
					The database includes detailed specifications such as printing temperatures, material properties, color information, and purchase links - all structured in a consistent, machine-readable format.
				</p>
			</div>
		</div>

		<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
			<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">How can I use it?</h2>
			<div class="space-y-3 text-gray-600 dark:text-gray-400">
				<p>
					The data is available in JSON format and can be integrated into slicer software, inventory management systems, or any application that needs filament information.
				</p>
				<p>
					Use this web interface to browse and contribute to the database, or access the raw data directly from the GitHub repository.
				</p>
			</div>
		</div>
	</div>

	<!-- Contributors Section -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Contributors</h2>
		<p class="mb-4 text-gray-600 dark:text-gray-400">
			This project is maintained by the community. Thank you to everyone who has contributed!
		</p>
		<!-- Placeholder for GitHub contributors - will be populated later -->
		<div class="flex flex-wrap gap-2">
			<div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" title="Placeholder"></div>
			<div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" title="Placeholder"></div>
			<div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" title="Placeholder"></div>
			<div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" title="Placeholder"></div>
			<div class="h-10 w-10 rounded-full bg-gray-200 dark:bg-gray-700" title="Placeholder"></div>
			<span class="flex h-10 items-center text-sm text-gray-500 dark:text-gray-400">+ more</span>
		</div>
	</div>

	<!-- Contributing Section -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">Contributing</h2>
		<div class="space-y-4 text-gray-600 dark:text-gray-400">
			<p>
				We welcome contributions from the community! Here's how you can help:
			</p>
			<ul class="list-inside list-disc space-y-2">
				<li>Add new filament brands and products</li>
				<li>Update existing entries with accurate information</li>
				<li>Report errors or inconsistencies</li>
				<li>Improve the documentation</li>
				<li>Help with code and tooling</li>
			</ul>
			<div class="flex flex-wrap gap-4 pt-4">
				<a
					href="https://github.com/open-filament/open-filament-database"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
				>
					<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
						<path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
					</svg>
					View on GitHub
				</a>
				<a
					href="https://github.com/open-filament/open-filament-database/issues"
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
				>
					Report an Issue
				</a>
			</div>
		</div>
	</div>

	<!-- License -->
	<div class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
		<h2 class="mb-4 text-xl font-semibold text-gray-900 dark:text-white">License</h2>
		<p class="text-gray-600 dark:text-gray-400">
			The Open Filament Database is released under an open-source license. The data is free to use for both personal and commercial purposes, with attribution appreciated.
		</p>
	</div>
</div>
