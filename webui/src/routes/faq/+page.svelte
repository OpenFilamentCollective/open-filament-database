<script lang="ts">
	import { isCloudMode, isLocalMode } from '$lib/stores/environment';
	import { Button } from '$lib/components/ui';

	interface FAQItem {
		question: string;
		answer: string;
		category: 'general' | 'local' | 'cloud' | 'ids' | 'changes';
	}

	const faqs: FAQItem[] = [
		{
			category: 'general',
			question: 'What is the Open Filament Database?',
			answer:
				'The Open Filament Database is a community-driven database of 3D printing filament information. It includes details about brands, materials, filaments, variants, and stores where you can purchase them.'
		},
		{
			category: 'general',
			question: 'What are the two modes of operation?',
			answer:
				'The application can run in two modes: Local Mode and Cloud Mode. Local Mode is for running the application on your computer with direct filesystem access. Cloud Mode is for running the application in a browser with data fetched from an external API.'
		},
		{
			category: 'local',
			question: 'What is Local Mode?',
			answer:
				'Local Mode is designed for contributors and developers. When running in Local Mode, changes you make are saved directly to the filesystem. This mode requires running the application on your local machine with appropriate file system permissions. You can edit, add, and delete entries, and the changes are immediately written to the database files.'
		},
		{
			category: 'cloud',
			question: 'What is Cloud Mode?',
			answer:
				'Cloud Mode is designed for browsing and testing. When running in Cloud Mode, the application fetches data from an external API (api.openfilamentdatabase.org). Changes you make are NOT saved to the database - instead, they are tracked in your browser\'s localStorage. This allows you to experiment with edits, create test entries, and export your changes as JSON without affecting the actual database.'
		},
		{
			category: 'cloud',
			question: 'How do changes work in Cloud Mode?',
			answer:
				'In Cloud Mode, all changes (creates, updates, deletes) are tracked in your browser\'s localStorage. The changes are layered over the base data from the API, so you see your modifications immediately. A changes menu (📝) in the top-right corner shows all pending changes with a badge indicating the count. You can review changes, undo individual changes, export all changes as JSON, or clear all changes.'
		},
		{
			category: 'cloud',
			question: 'What happens to my changes in Cloud Mode?',
			answer:
				'Changes in Cloud Mode are stored only in your browser\'s localStorage. They persist across browser sessions on the same device, but are not synchronized to the server or other devices. If you clear your browser data or use a different browser/device, your changes will be lost unless you export them first. Use the "Export as JSON" button in the changes menu to save your changes to a file.'
		},
		{
			category: 'cloud',
			question: 'How do I contribute my changes to the database?',
			answer:
				'In Cloud Mode, you can contribute through the GitHub integration:\n\n1. Make your changes in the web UI (add, edit, or delete entries)\n2. Open the changes menu (📝) and review your changes\n3. Click "Export to GitHub" (coming soon)\n4. Log in with your GitHub account\n5. The system will automatically create a pull request with your changes\n\nAlternatively, you can click "Export as JSON" to download your changes and manually submit them to the GitHub repository. The GitHub bot integration makes contributing much easier by handling the pull request creation for you.'
		},
		{
			category: 'ids',
			question: 'What is the difference between IDs in Local Mode vs Cloud Mode?',
			answer:
				'This is an important distinction:\n\n• Local Mode IDs: Follow the OpenPrintTag specification. IDs use underscores (e.g., "3d_eksperten", "prusament_pla") and must match the specification pattern: lowercase letters, numbers, and underscores only.\n\n• Cloud Mode IDs: Are automatically generated from the name when you create a new entry. They use hyphens instead of underscores and are converted to lowercase (e.g., "3D Eksperten" becomes "3d-eksperten"). This is called a "slug" and is used for URL-friendly identifiers.\n\nThe ID shown in the UI is always the actual database ID, not the slug.'
		},
		{
			category: 'ids',
			question: 'Why do I see different IDs for the same store/brand?',
			answer:
				'If you\'re in Cloud Mode and comparing to Local Mode data, you might notice different ID formats. Cloud Mode generates URL-friendly slugs from names (with hyphens), while Local Mode uses the official OpenPrintTag specification IDs (with underscores). The card displays always show the actual ID from the database, which is what you should use when referencing entities.'
		},
		{
			category: 'ids',
			question: 'What is the OpenPrintTag ID specification?',
			answer:
				'The OpenPrintTag specification defines the ID format for all entities in the database. IDs must:\n\n• Use only lowercase letters (a-z)\n• Use only numbers (0-9)\n• Use only underscores (_) as separators\n• Use plus signs (+) for special cases\n• Match the pattern: ^[a-z0-9+]+(_[a-z0-9+]+)*$\n\nExamples: "prusament", "3d_jake", "pla_plus", "carbon_fiber_petg"'
		},
		{
			category: 'changes',
			question: 'How do I see what changes I\'ve made?',
			answer:
				'In Cloud Mode, click the changes menu button (📝) in the top-right corner. This opens a panel showing all pending changes with details including the operation type (create/update/delete), entity type, description, timestamp, and for updates, the specific properties that changed.'
		},
		{
			category: 'changes',
			question: 'How do I undo a change?',
			answer:
				'In the changes menu, each change has an "Undo" button. Clicking it will remove that specific change from your pending changes, reverting to the original data from the API.'
		},
		{
			category: 'changes',
			question: 'What does the property changes list show?',
			answer:
				'For updates, the changes menu shows exactly which properties were modified. You can expand the "property changes" section to see each property that changed, showing the old and new values. This helps you understand exactly what was modified.'
		},
		{
			category: 'changes',
			question: 'How do I export my changes?',
			answer:
				'Click the changes menu (📝) and then click "Export as JSON". This downloads a JSON file containing all your changes, including any images you uploaded (embedded as base64). The export includes metadata like timestamp and change counts.'
		},
		{
			category: 'changes',
			question: 'What is included in the JSON export?',
			answer:
				'The JSON export includes:\n\n• Metadata: Export timestamp, version, change count, image count\n• Changes: All creates, updates, and deletes with full entity data and property-level changes\n• Images: Any logos or images you uploaded, embedded as base64 with MIME type information\n\nThis export can be used for backup, review, or submission to the project maintainers.'
		},
		{
			category: 'changes',
			question: 'How do I clear all my changes?',
			answer:
				'In the changes menu, click "Clear All". This will remove all pending changes and stored images from localStorage. This action cannot be undone, so make sure to export your changes first if you want to keep them.'
		},
		{
			category: 'changes',
			question: 'Why does it say "Created" when I edited something?',
			answer:
				'This was a bug that has been fixed. If you still see this, try refreshing the page. Updates should now correctly show as "UPDATE" operations with property-level change tracking.'
		},
		{
			category: 'cloud',
			question: 'Are there storage limits for changes?',
			answer:
				'Yes. Browser localStorage typically has a limit of 5-10 MB per origin. Images are stored as base64 which adds about 33% overhead. If you upload many images, you may hit the storage limit. The application will show an error if this happens. Export and clear your changes regularly if working with many images.'
		},
		{
			category: 'local',
			question: 'How do I switch between Local and Cloud Mode?',
			answer:
				'Mode is determined by the PUBLIC_APP_MODE environment variable in the .env file. Set it to "local" for Local Mode or "cloud" for Cloud Mode. You need to restart the application after changing this setting. The current mode is indicated by an icon in the top-right corner (cloud icon for Cloud Mode, computer icon for Local Mode).'
		},
		{
			category: 'general',
			question: 'How do I contribute to the database?',
			answer:
				'The recommended way to contribute is through Cloud Mode using the GitHub integration:\n\n• Cloud Mode (Recommended): Make changes in the web UI, then use "Export to GitHub" in the changes menu. This will authenticate with GitHub and automatically create a pull request with your changes.\n\n• Local Mode (Advanced): For developers who want to work directly with the codebase, you can fork the repository, run in Local Mode, make changes following the OpenPrintTag specification, and create a pull request manually.\n\nThe GitHub integration makes contributing accessible to everyone, even if you\'re not familiar with Git or development tools.'
		},
		{
			category: 'cloud',
			question: 'What is the "Export to GitHub" feature?',
			answer:
				'The "Export to GitHub" feature (coming soon) allows you to submit your Cloud Mode changes directly to the database repository:\n\n1. Click "Export to GitHub" in the changes menu\n2. Authenticate with your GitHub account (OAuth login)\n3. The system creates a pull request with your changes automatically\n4. Maintainers review and merge your contribution\n\nThis feature uses a GitHub bot to handle the technical details, so you don\'t need to know how to use Git or create pull requests manually. It\'s the easiest way to contribute!'
		},
		{
			category: 'cloud',
			question: 'Do I need a GitHub account to contribute?',
			answer:
				'Yes, to contribute changes to the database, you need a free GitHub account. This is required for the "Export to GitHub" feature to create pull requests on your behalf. Creating a GitHub account is free and takes just a few minutes at github.com.'
		},
		{
			category: 'cloud',
			question: 'What happens after I submit changes via GitHub?',
			answer:
				'After you use "Export to GitHub":\n\n1. A pull request is created in the repository with your changes\n2. Maintainers are notified and will review your contribution\n3. They may ask questions or request modifications in the PR comments\n4. Once approved, your changes are merged into the main database\n5. Your contribution becomes available to everyone!\n\nYou\'ll receive GitHub notifications about the status of your pull request.'
		}
	];

	const categories = [
		{ id: 'general', name: 'General', icon: '📚' },
		{ id: 'local', name: 'Local Mode', icon: '💻' },
		{ id: 'cloud', name: 'Cloud Mode', icon: '☁️' },
		{ id: 'ids', name: 'IDs & Slugs', icon: '🏷️' },
		{ id: 'changes', name: 'Change Tracking', icon: '📝' }
	];

	let selectedCategory = $state<string | null>(null);

	function filterFAQs(category: string | null): FAQItem[] {
		if (!category) return faqs;
		return faqs.filter((faq) => faq.category === category);
	}

	let filteredFAQs = $derived(filterFAQs(selectedCategory));
</script>

<svelte:head>
	<title>FAQs</title>
</svelte:head>

<div class="container mx-auto px-4 py-8 max-w-4xl">
	<div class="mb-8">
		<a href="/" class="text-primary hover:text-primary flex items-center gap-2 mb-4">
			← Back to Home
		</a>
		<h1 class="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
		<p class="text-muted-foreground">
			Everything you need to know about using the Open Filament Database web interface
		</p>
	</div>

	<!-- Current mode indicator -->
	<div class="mb-8 p-4 rounded-lg border-2 {$isLocalMode ? 'bg-green-50 border-green-300' : 'bg-primary/10 border-primary/30'}">
		<div class="flex items-center gap-3">
			<span class="text-3xl">{$isLocalMode ? '💻' : '☁️'}</span>
			<div>
				<h2 class="font-semibold text-lg">
					Currently running in: {$isLocalMode ? 'Local Mode' : 'Cloud Mode'}
				</h2>
				<p class="text-sm text-foreground">
					{#if $isLocalMode}
						Changes are saved directly to the filesystem.
					{:else}
						Changes are tracked in your browser and can be exported as JSON.
					{/if}
				</p>
			</div>
		</div>
	</div>

	<!-- Category filters -->
	<div class="mb-8">
		<h2 class="text-lg font-semibold mb-3">Filter by category:</h2>
		<div class="flex flex-wrap gap-2">
			<Button
				onclick={() => (selectedCategory = null)}
				variant="outline"
				size="flex"
				active={selectedCategory === null}
				class="rounded-lg border-2"
			>
				All Questions
			</Button>
			{#each categories as category}
				<Button
					onclick={() => (selectedCategory = category.id)}
					variant="outline"
					size="flex"
					active={selectedCategory === category.id}
					class="rounded-lg border-2"
				>
					<span>{category.icon}</span>
					{category.name}
				</Button>
			{/each}
		</div>
	</div>

	<!-- FAQ items -->
	<div class="space-y-4">
		{#each filteredFAQs as faq}
			<details class="group bg-card border border-border rounded-lg p-6 hover:border-primary/30 transition-colors">
				<summary class="cursor-pointer font-semibold text-lg list-none flex items-start gap-3">
					<span class="text-2xl flex-shrink-0">
						{categories.find((c) => c.id === faq.category)?.icon || '❓'}
					</span>
					<span class="flex-1">{faq.question}</span>
					<svg
						class="w-5 h-5 flex-shrink-0 transition-transform group-open:rotate-180 mt-1"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</summary>
				<div class="mt-4 ml-11 text-foreground whitespace-pre-line leading-relaxed">
					{faq.answer}
				</div>
			</details>
		{/each}
	</div>

	<!-- Additional resources -->
	<div class="mt-12 p-6 bg-card border border-border rounded-lg">
		<h2 class="text-xl font-semibold mb-4">Additional Resources</h2>
		<ul class="space-y-3 text-foreground">
			<li>
				<a
					href="https://github.com/OpenFilamentCollective/open-filament-database"
					target="_blank"
					class="text-primary hover:underline flex items-center gap-2"
				>
					<span>📦</span>
					<span>GitHub Repository</span>
				</a>
			</li>
			<li>
				<a
					href="/CHANGE_TRACKING_SYSTEM.md"
					target="_blank"
					class="text-primary hover:underline flex items-center gap-2"
				>
					<span>📖</span>
					<span>Change Tracking System Documentation</span>
				</a>
			</li>
			<li>
				<a
					href="https://api.openfilamentdatabase.org"
					target="_blank"
					class="text-primary hover:underline flex items-center gap-2"
				>
					<span>🌐</span>
					<span>API Documentation</span>
				</a>
			</li>
		</ul>
	</div>

	<!-- Still have questions -->
	<div class="mt-8 text-center p-6">
		<h3 class="text-lg font-semibold mb-2">Still have questions?</h3>
		<p class="text-muted-foreground mb-4">
			Open an issue on GitHub or join our community discussions.
		</p>
		<Button
			onclick={() => window.open('https://github.com/OpenPrintTag/open-filament-database/issues', '_blank')}
			variant="primary"
			class="inline-flex items-center gap-2"
		>
			<span>💬</span>
			<span>Ask a Question on GitHub</span>
		</Button>
	</div>
</div>

<style>
	details summary::-webkit-details-marker {
		display: none;
	}
</style>
