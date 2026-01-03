<script>
  import BrandForm from '$lib/components/forms/brand/brandForm.svelte';
  import BrandItem from '$lib/components/items/brandItem.svelte';
  import EditModal from '$lib/components/editModal.svelte';
  import { browser } from '$app/environment';
  import { stripOfIllegalChars } from '$lib/globalHelpers';
  import { isItemDeleted } from '$lib/pseudoDeleter.js';
  import { getEditItems } from '$lib/pseudoEditor.js';
  const { data } = $props();

  const filamentData = $derived(data.filamentData);

  const filteredBrands = $derived(
    !browser || !filamentData?.brands
      ? {}
      : Object.fromEntries(
          Object.entries(filamentData.brands).filter(([brand]) => !isItemDeleted('brand', stripOfIllegalChars(brand))),
        ),
  );
  let editedBrands = getEditItems("brand");

  function getConditionalBrandLogo(brandName, brandData) {
    let inFilData = false;
    // Remove if it exists in the DB
    Object.entries(filamentData.brands).forEach(([brand]) => {
      if (brandName === brand) {
        inFilData = true;
      }
    });

    if (inFilData) {
      return undefined;
    }

    return `data:image/png;base64,${brandData.logoData}`
  };
</script>

<svelte:head>
	<title>Brands</title>
	<meta name="description" content="This is a overview of the brands"/>
</svelte:head>

<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 text-center">Brands</h1>

  <EditModal
    externalStyling="bg-blue-500 hover:bg-blue-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
    btnType={'create'}
    spanText="Add brand"
  >
    <BrandForm defaultForm={data.form} formType={'create'} />
  </EditModal>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
    {#each Object.entries(filteredBrands) as [brandName, brandData]}
      <BrandItem {brandName} {brandData} />
    {/each}
    {#if editedBrands}
      {#each editedBrands as brandData}
        <BrandItem
          brandName={brandData.brandName}
          brandData={brandData.data}
          imgOverride = {getConditionalBrandLogo(brandData.brandName, brandData.data)}
        />
      {/each}
    {/if}
  </div>
</section>
