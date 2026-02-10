<script lang="ts">
  import Fa from 'svelte-fa'
  import { faX } from '@fortawesome/free-solid-svg-icons'
  import EditModal from '$lib/components/editModal.svelte';
  import VariantForm from '$lib/components/forms/variant/VariantForm.svelte';
  import SizeItem from '$lib/components/items/sizeItem.svelte';
  import Tooltip from "sv-tooltip"
  import { traitLabels } from '$lib/validation/filament-variant-schema';

  const { data } = $props();
</script>

<svelte:head>
  <title>{data?.colorData?.name ? data.colorData.name : "Variant"}</title>
  <meta name="description" content="This is an overview of {data?.colorData?.name ? data.colorData.name : "a Variant"}"/>
</svelte:head>

<div class="max-w-6xl mx-auto p-6">
  <!-- Main Color Card -->
  <div
    class="border rounded-lg p-8 bg-white border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 transition-colors mb-2">
    <!-- Header Section -->
    <div class="flex items-center justify-between">
      <div> 
        <div class="flex text-left items-center gap-4">
          {#if data.colorData.variant?.color_hex}
            <span
              class="inline-block w-12 h-12 rounded-full border-2 border-gray-300 dark:border-gray-600 shadow-lg"
              style="background-color: {data.colorData.variant.color_hex};"
              title={data.colorData.variant.color_hex}></span>
          {/if}

          <div>
            <h1 class="text-4xl font-bold mb-1">{data.colorData.name}</h1>

            {#if data.colorData.variant?.color_hex}
              <span class="text-lg text-gray-500 dark:text-gray-400 font-mono">
                {data.colorData.variant.color_hex}
              </span>
            {/if}
          </div>
        </div>

        {#if data.colorData.variant?.discontinued}
          <Tooltip tip="It has being marked as no longer being made" right>
            <span class="text-red-500 flex items-center">
              <div class="bg-red-700 mr-1 p-1 rounded-md">
                <Fa icon={faX} />
              </div>
              Discontinued
            </span>
          </Tooltip>
        {/if}
      </div>

      <div class="btn-wraper flex gap-2">
        {#key data.colorData}
          <EditModal
            externalStyling="bg-yellow-600 hover:bg-yellow-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors" 
            spanText={'Edit Variant'}
          >
            <VariantForm
              defaultForm={data.variantForm}
              brandId={data.brandData.id}
              materialId={data.materialData.material}
              filamentId={data.filamentData.id}
              colorData={data.colorData}
              formType={'edit'}
              stores={data.stores} />
          </EditModal>
        {/key}
      </div>
    </div>
  </div>

  <!-- Traits Section - Only show if traits exist and have values -->
  {#if data.colorData.variant?.traits && Object.entries(data.colorData.variant.traits).some(([trait, value]) => value)}
    <div class="mb-8">
      <h2 class="text-xl font-semibold mb-4">Traits</h2>
      <div class="flex flex-wrap gap-3">
        {#each Object.entries(data.colorData.variant.traits) as [trait, value]}
          {#if value}
            <div
              class="flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm">
              <svg
                class="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="3">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <span>{traitLabels[trait] || trait}</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  <!-- Size Information Section -->
  <div class="mb-8">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold">Size Information</h2>
    </div>

    {#if data.colorData.sizes && data.colorData.sizes.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each data.colorData.sizes as size, index}
          <SizeItem
            size={size}
          />
        {/each}
      </div>
    {:else}
      <div class="text-center py-8 text-gray-500 dark:text-gray-400">
        <p>No size information available yet.</p>
        <p class="text-sm mt-2">Click the edit button above to add size details.</p>
      </div>
    {/if}
  </div>
</div>
