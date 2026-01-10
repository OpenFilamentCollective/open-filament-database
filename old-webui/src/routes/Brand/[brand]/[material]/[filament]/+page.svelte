<script lang="ts">
  import EditModal from '$lib/components/editModal.svelte';
  import FilamentForm from '$lib/components/forms/filament/filamentForm.svelte';
  import FilamentItem from '$lib/components/items/filamentItem.svelte';
  import VariantForm from '$lib/components/forms/variant/VariantForm.svelte';
  import { stripOfIllegalChars } from '$lib/globalHelpers.js';

  const { data } = $props();
  const colorKeys = Object.keys(data.filamentData.colors ?? {});
</script>

<svelte:head>
	<title>{data?.filamentData?.name ? data.filamentData.name : "Filament"}</title>
	<meta name="description" content="This is an overview of {data?.filamentData?.name ? data.filamentData.name : "a Filament"}"/>
</svelte:head>

<section
  class="max-w-full mt-5 mx-auto px-4 py-12 bg-white dark:bg-gray-900 rounded-xl shadow text-gray-900 dark:text-gray-100">
  <h1 class="text-3xl font-bold mb-4">
    Filament: {data.filamentData.name}
  </h1>

  <div class="flex space-x-2">
    <EditModal
      externalStyling="bg-yellow-600 hover:bg-yellow-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
      spanText={`Edit ${data.filamentData.name}`}
    >
      <FilamentForm
        defaultForm={data.filamentForm}
        brandId={data.brandData.id}
        materialId={data.materialData.material}
        formType={'edit'} />
    </EditModal>
    <EditModal
      externalStyling="bg-blue-500 hover:bg-blue-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
      btnType={'create'}
      spanText="Add variant"
    >
      <VariantForm
        defaultForm={data.variantForm}
        brandId={data.brandData.id}
        materialId={data.materialData.material}
        filamentId={data.filamentData.id}
        formType={'create'}
        stores={data.stores} />
    </EditModal>
  </div>

  <h2 class="text-2xl font-semibold mb-4">Variants</h2>
  <div class="space-y-6">

    {#each colorKeys as colorKey}
      {#if data?.filamentData?.colors?.[colorKey]}
        <FilamentItem
          color={data.filamentData.colors[colorKey]}
          brandId={data.brandData.id}
          materialId={data.materialData.material}
          filamentId={data.filamentData.id} />
      {/if}
    {/each}
  </div>
</section>
