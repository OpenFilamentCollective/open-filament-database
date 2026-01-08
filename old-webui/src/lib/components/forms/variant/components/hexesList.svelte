<script lang="ts">
  import HexItem from "./hexItem.svelte";
  import { writable } from 'svelte/store';

  export let title, hexes, idPrefix, description;

  let tempHexes = writable([]);

  // Function to add a new hex 
  function addHex() {
    if (!tempHexes) {
      tempHexes = writable([]);
    }
    tempHexes.update(items => [
      ...items,
      { id: Math.max(0, ...items.map(i => i.id)) + 1, value: undefined },
    ]);
  }

  // Function to remove a hex
  function removeHex(index: number) {
    tempHexes.update(items => items.filter((_, i) => i !== index));
  }

  if (hexes) {
    let transformHexes = [];

    if (typeof hexes == "string" || hexes instanceof String) {
      hexes = [
        hexes
      ];
    }

    Array.from(hexes).forEach((value, index) => {
      transformHexes[index] = {
        id: index,
        value: value,
      };
    });

    tempHexes.set(transformHexes);
  }

  tempHexes.subscribe((value) => {
    hexes = value.map((x) => x.value);
  })
</script>

<div>
  <legend class="block font-medium">
    {title}
    <span class="text-red-500">*</span>
  </legend>

  <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">
    {description}
  </p>

  <div class="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
    
    <div>
      <div class="flex items-center justify-between mb-4">
        <button
          type="button"
          onclick={addHex}
          class="text-sm px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition-colors">
          + Add Hex
        </button>
      </div>

      {#if $tempHexes && $tempHexes.length > 0}
        <div class="flex flex-col space-y-6">
          {#each $tempHexes as hex, index (hex.id)}
            <HexItem 
              bind:formVar={hex.value}
              idPrefix={idPrefix}
              index={index}
              removeHex={() => removeHex(index)}
              errors={null}
            />
          {/each}
        </div>
      {:else}
        <div class="text-center py-4 text-gray-500 dark:text-gray-400">
          <p class="text-sm">No hexes added yet.</p>
          <p class="text-xs mt-1">Click "Add Hex" to add one.</p>
        </div>
      {/if}
    </div>
  </div>
</div>