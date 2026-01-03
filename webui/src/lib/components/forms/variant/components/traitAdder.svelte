<script lang="ts">
  import { traitsSchema, traitLabels } from '$lib/validation/filament-variant-schema';

  let { formTraits = $bindable({}) } = $props();

  let showTraitMenu = $state(false);
  let searchQuery = $state('');
  let allTraits = Object.keys(traitsSchema.shape).sort();

  function toggleTrait(traitName) {
    formTraits = {
      ...formTraits,
      [traitName]: !formTraits[traitName]
    };
    showTraitMenu = false;
    searchQuery = '';
  }

  function removeTrait(traitName) {
    formTraits = {
      ...formTraits,
      [traitName]: false
    };
  }

  const filteredTraits = $derived(allTraits.filter(
    trait => trait.toLowerCase().includes(searchQuery.toLowerCase()) && !formTraits[trait]
  ));
</script>

<fieldset>
  <legend class="block font-medium mb-2">Material Traits</legend>
  <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
    Select all special properties that apply to this filament variant
  </p>
  <div class="flex flex-wrap gap-2 items-center">
    {#each allTraits as trait}
      {#if formTraits[trait]}
        <div class="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 px-3 py-1 rounded-full">
          <span class="text-sm font-medium">{traitLabels[trait]}</span>
          <button
            type="button"
            onclick={() => removeTrait(trait)}
            class="text-blue-900 dark:text-blue-100 hover:text-blue-700 dark:hover:text-blue-300 font-bold"
            aria-label="Remove {traitLabels[trait]} trait">
            ✕
          </button>
        </div>
      {/if}
    {/each}
    
    <!-- Add button -->
    <div class="relative">
      <button
        type="button"
        onclick={() => {
          showTraitMenu = !showTraitMenu;
          searchQuery = '';
        }}
        class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm font-medium">
        + Add Trait
      </button>

      <!-- Popup menu -->
      {#if showTraitMenu}
        <div class="absolute top-full left-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg z-50">
          <!-- Search bar -->
          <div class="p-3 border-b border-gray-200 dark:border-gray-700">
            <input
              type="text"
              placeholder="Search traits..."
              bind:value={searchQuery}
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autofocus />
          </div>

          <!-- Trait list with overflow scroll -->
          <div class="max-h-64 overflow-y-auto">
            {#if filteredTraits.length > 0}
              {#each filteredTraits as trait}
                <button
                  type="button"
                  onclick={() => toggleTrait(trait)}
                  class="w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-900 dark:text-white border-b border-gray-100 dark:border-gray-700 last:border-0">
                  {traitLabels[trait]}
                </button>
              {/each}
            {:else}
              <div class="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm text-center">
                {#if searchQuery}
                  No traits found
                {:else}
                  All traits added
                {/if}
              </div>
            {/if}
          </div>
        </div>

        <!-- Backdrop to close menu -->
        <div
          onclick={() => (showTraitMenu = false)}
          class="fixed inset-0 z-40"
        />
      {/if}
    </div>
  </div>
</fieldset>
