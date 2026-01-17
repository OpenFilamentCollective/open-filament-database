<script>
  import { browser } from '$app/environment';
  import EditModal from '$lib/components/editModal.svelte';
  import StoreForm from '$lib/components/forms/store/storeForm.svelte';
  import StoreItem from '$lib/components/items/storeItem.svelte';
  const { data } = $props();

  const filamentData = $derived(data.filamentData);

  const filteredStores = $derived(
    !browser || !filamentData?.stores
      ? {}
      : Object.fromEntries(
          Object.entries(filamentData.stores).filter(([store]) => true), // adapt isdeleted
        ),
  );
</script>

<svelte:head>
	<title>Storefronts</title>
	<meta name="description" content="This is a overview of the storefronts"/>
</svelte:head>

<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8 text-center">Storefronts</h1>

  <EditModal
    externalStyling="bg-blue-500 hover:bg-blue-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors"
    btnType={'create'}
    spanText="Add store"
  >
    <StoreForm defaultForm={data.form} formType={'create'} />
  </EditModal>
  <div class="flex flex-col space-y-4">
    {#each Object.entries(filteredStores) as [storeName, storeData]}
      <StoreItem {storeName} {storeData} />
    {/each}
  </div>
</section>
