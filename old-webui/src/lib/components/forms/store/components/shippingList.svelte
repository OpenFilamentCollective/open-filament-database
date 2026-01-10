<script lang="ts">
  import ShippingItem from "./shippingItem.svelte";
  import { writable } from 'svelte/store';

  export let title, regions, idPrefix;

  let tempRegions = writable([]);

  // Function to add a new region 
  function addRegion() {
    if (!tempRegions) {
      tempRegions = writable([]);
    }
    tempRegions.update(items => [
      ...items,
      { id: Math.max(0, ...items.map(i => i.id)) + 1, value: undefined },
    ]);
  }

  // Function to remove a region
  function removeRegion(index: number) {
    tempRegions.update(items => items.filter((_, i) => i !== index));
  }

  if (regions) {
    var transformRegions = [];

    if (typeof regions == "string" || regions instanceof String) {
      regions = [
        regions
      ];
    }

    Array.from(regions).forEach((value, index) => {
      transformRegions[index] = {
        id: index,
        value: value,
      };
    });

    tempRegions.set(transformRegions);
  }

  tempRegions.subscribe((value) => {
    regions = value.map((x) => x.value);
  })
</script>

<div class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
  
  <div>
    <div class="flex items-center justify-between mb-4">
      <legend class="block font-medium">{title}</legend>
      <button
        type="button"
        onclick={addRegion}
        class="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
        + Add Region
      </button>
    </div>

    {#if $tempRegions && $tempRegions.length > 0}
      <div class="flex flex-col space-y-6">
        {#each $tempRegions as region, index (region.id)}
          <ShippingItem 
            bind:formVar={region.value}
            idPrefix={idPrefix}
            index={index}
            removeRegion={() => removeRegion(index)}
          />
        {/each}
      </div>
    {:else}
      <div class="text-center py-4 text-gray-500 dark:text-gray-400">
        <p class="text-sm">No regions added yet.</p>
        <p class="text-xs mt-1">Click "Add Region" to add one.</p>
      </div>
    {/if}
  </div>
</div>