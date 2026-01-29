<script lang="ts">
  import { browser } from '$app/environment';
  import EditModal from '$lib/components/editModal.svelte';
  import FilamentForm from '$lib/components/forms/filament/filamentForm.svelte';
  import MaterialForm from '$lib/components/forms/material/materialForm.svelte';
  import MaterialItem from '$lib/components/items/materialItem.svelte';
  import { isItemDeleted } from '$lib/pseudoDeleter.js';

  const { data } = $props();
  let filamentKeys = Object.keys(data.materialData.filaments ?? {});

  const filteredFilamentKeys = $derived(
    !browser
      ? filamentKeys
      : filamentKeys.filter(
          (filamentKey) =>
            !isItemDeleted(
              'filament',
              filamentKey,
              data.brandData.id,
              data.materialData.material,
            ),
        ),
  );

  $effect(() => {
    filamentKeys = Object.keys(data.materialData.filaments ?? {});
  });
</script>

<svelte:head>
	<title>{data?.materialData?.material ? data.materialData.material : "Material"}</title>
	<meta name="description" content="This is an overview of {data?.materialData?.material ? data.materialData.material : "a Material"}"/>
</svelte:head>

<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
  <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">
    Filaments for {data.materialData.material}
  </h1>
  <div class="btn-wrapper flex gap-2">
    <EditModal
      externalStyling="bg-yellow-600 hover:bg-yellow-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
      spanText={data?.materialData?.material ? `Edit ${data.materialData.material}` : ""}
    >
      <MaterialForm
        defaultForm={data.materialForm}
        brandId={data.brandData.id}
        formType={'edit'} />
    </EditModal>
    <EditModal
      externalStyling="bg-blue-500 hover:bg-blue-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
      btnType={'create'}
      spanText="Add filament"
    >
      <FilamentForm
        defaultForm={data.filamentForm}
        brandId={data.brandData.id}
        materialId={data.materialData.material}
        formType={'create'} 
      />
    </EditModal>
  </div>

  <div class="flex flex-wrap space-x-4 space-y-4 mt-2">
    {#key [filteredFilamentKeys, data.materialData.filaments]}
      {#each filteredFilamentKeys as filamentKey}
        {#if data.materialData.filaments[filamentKey]}
          <MaterialItem
            filament={data.materialData.filaments[filamentKey]}
            brandId={data.brandData.id}
            materialName={data.materialData.material} />
        {/if}
      {/each}
    {/key}
  </div>
</section>
