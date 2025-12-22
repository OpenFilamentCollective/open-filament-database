<script lang="ts">
  import CountryItem from '$lib/components/items/countryItem.svelte';
  import EditModal from '$lib/components/editModal.svelte';
  import StoreForm from '$lib/components/forms/store/storeForm.svelte';
  import { faCheck } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';
  import { stripOfIllegalChars } from '$lib/globalHelpers.js';

  const { data } = $props();
</script>

<svelte:head>
	<title>{data?.storeData?.name ? data?.storeData?.name : "Storefront"}</title>
	<meta name="description" content="This is an overview of {data?.storeData?.name ? data?.storeData?.name : "a store"}"/>
</svelte:head>

<div class="max-w-6xl mx-auto p-6 flex flex-col">
  <!-- Main Color Card -->
  <div
    class="border rounded-lg p-4 bg-white border-gray-200 text-gray-900 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 transition-colors mb-2">
    <!-- Header Section -->
    <div class="flex items-center justify-between">
      <div> 
        <div class="flex text-left gap-3">
          {#if data.storeData?.logo}
            <img
              src={`/stores/${stripOfIllegalChars(data.storeData.id)}/${data.storeData.logo}`}
              alt={data.storeData.name + ' logo'}
              class="w-35 h-35 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
              loading="lazy"
            />
          {/if}

          <div class="flex flex-col">
            <div class="flex flex-col h-full">
              <h1 class="text-4xl font-bold mb-1">
                {data.storeData.name}
              </h1>
              <span class="text-sm text-gray-500 dark:text-gray-400 font-mono">
                id: {data.storeData.id}
              </span>
              <a href={data.storeData.storefront_url} class="text-md text-blue-600 dark:text-blue-400 hover:underline">
                Visit Website
              </a>

              <div class="grow"></div>

            </div>
          </div>
        </div>
      </div>

      <div class="btn-wraper flex gap-2">
        {#key data.storeData}
          <EditModal
            externalStyling="bg-yellow-600 hover:bg-yellow-700 border border-gray-300 dark:border-gray-700 mb-4 rounded-lg shadow transition-colors" 
            spanText={'Edit Store'}
          >
            <StoreForm
              defaultForm={data.storeForm}
              formType={'edit'} />
          </EditModal>
        {/key}
      </div>
    </div>

    <div class="max-w-1/2 border border-gray-200 dark:border-gray-700 rounded-lg mt-2 p-2">
      <div class="flex justify-center justify-between mb-4">
        <h2 class="text-xl font-semibold">Shipping Information</h2>
      </div>

      <div class="flex max-h-50">
        <div class="flex flex-col w-1/2 border-r-1 border-gray-200 dark:border-gray-700 px-2">
          <b class="border-b-1 border-gray-200 dark:border-gray-700 mb-1">From</b>
          <div class="flex flex-wrap text-center space-x-1 space-y-1">
            {#if data.storeData?.ships_from}
              {#if Array.isArray(data.storeData?.ships_from)}
                {#if data.storeData?.ships_from?.length > 0}
                  {#each data.storeData?.ships_from as from}
                    <CountryItem
                      code={from}
                    />
                  {/each}
                {/if}
              {:else if typeof(data.storeData?.ships_from) == "string"}
                {#if data.storeData?.ships_from != ""}
                  <CountryItem
                    code={data.storeData?.ships_from}
                  />
                {/if}
              {/if}
            {/if}
          </div>
        </div>
        <div class="flex flex-col w-1/2 border-l-1 border-gray-200 dark:border-gray-700 px-2">
          <b class="border-b-1 border-gray-200 dark:border-gray-700 mb-1">To</b>
          <div class="flex flex-wrap-reverse text-center space-x-1 space-y-1">
            {#if data.storeData?.ships_to}
              {#if Array.isArray(data.storeData?.ships_to)}
                {#if data.storeData?.ships_to?.length > 0}
                  {#each data.storeData?.ships_to as to}
                    <CountryItem
                      code={to}
                    />
                  {/each}
                {/if}
              {:else if typeof(data.storeData?.ships_to) == "string"}
                {#if data.storeData?.ships_to != ""}
                  <CountryItem
                    code={data.storeData?.ships_to}
                  />
                {/if}
              {/if}
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
</div>