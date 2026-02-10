<script lang="ts">
  import BrandForm from '$lib/components/forms/brand/brandForm.svelte';
  import EditModal from '$lib/components/editModal.svelte';
  import MaterialForm from '$lib/components/forms/material/materialForm.svelte';
  import { isItemDeleted } from '$lib/pseudoDeleter';
  import { browser } from '$app/environment';
  import { stripOfIllegalChars } from '$lib/globalHelpers.js';
  let { data } = $props();

  let brandData = data.brandData;
  let materialKeys = Object.keys(brandData.materials ?? {});

  const websiteUrl = $derived(
    brandData.website?.startsWith('http')
      ? brandData.website
      : `https://${brandData.website || ''}`,
  );

  const filteredMaterialKeys = $derived(
    !browser
      ? materialKeys
      : materialKeys.filter(
          (materialKey) => !isItemDeleted('material', materialKey, brandData.id || brandData.name),
        ),
  );
</script>

<svelte:head>
  <title>{brandData?.name ? brandData.name : "Brand"}</title>
  <meta name="description" content="This is an overview {brandData?.name ? brandData.name : "a Brand"}"/>
</svelte:head>

<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
  <div class="relative flex flex-col md:flex-row items-center md:items-start gap-6 mb-12">
    <img
      src={`/data/${brandData.id}/${brandData.logo}`}
      alt={brandData.name ? `${brandData.name} Logo` : 'Brand logo'}
      class="w-32 h-32 rounded-xl object-contain bg-white shadow-md dark:bg-gray-900" />
    
    <div class="text-center md:text-left">
      <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        {brandData.name ?? ''}
      </h1>
      <a
        href={websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        class="text-blue-600 dark:text-blue-400 hover:underline">
        Visit Website
      </a>
    </div>

    <EditModal
      externalStyling="bg-yellow-600 hover:bg-yellow-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
    >
      <BrandForm
        defaultForm={data.brandForm}
        formType={'edit'}
        brandId={brandData.id}
        brandLogo={brandData.logo}
      />
    </EditModal>
  </div>

  <div class="space-y-6">
    <h2 class="text-2xl font-semibold text-gray-900 dark:text-gray-100">Materials</h2>

    <EditModal
      externalStyling="bg-blue-500 hover:bg-blue-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
      btnType={'create'}
      spanText="Add material"
    >
      <MaterialForm
        defaultForm={data.materialForm}
        brandId={brandData.id}
        formType={'create'}
      />
    </EditModal>

    <ul class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {#key [filteredMaterialKeys, brandData.materials]}
        {#each filteredMaterialKeys as materialKey}
          {#if brandData.materials[materialKey]}
            <a href={`/Brand/${stripOfIllegalChars(brandData.id || brandData.name)}/${materialKey}`}>
              <li
                class="border rounded p-4 bg-white border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 shadow-md transition-colors flex flex-col justify-between">
                <div>
                  <div class="font-medium text-lg mb-1">
                    {brandData.materials[materialKey].material ?? materialKey}
                  </div>
                </div>
              </li>
            </a>
          {/if}
        {/each}
      {/key}
    </ul>
  </div>
</section>
