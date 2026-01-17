<script lang="ts">
  import CountryItem from "./countryItem.svelte";
  import Fa from "svelte-fa";
  import { faPen } from "@fortawesome/free-solid-svg-icons";
  import { stripOfIllegalChars } from "$lib/globalHelpers";

  let { storeName, storeData } = $props();
</script>

<div
  class="p-4 bg-white flex rounded-xl shadow-lg hover:shadow-xl relative transition-shadow duration-300 border border-gray-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 text-gray-900">
  <div class="flex w-1/2 md:w-2/6">
    <img
      src={`/stores/${stripOfIllegalChars(storeData.id)}/${storeData.logo}`}
      alt={storeName + ' logo'}
      class="w-30 h-30 rounded-lg object-contain bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700"
      loading="lazy"
    />
    <div class="flex flex-col ml-2">
      <div class="flex flex-col">
        <span class="text-xl font-bold text-gray-800 dark:text-gray-100">
          {storeData.name}
        </span>
        <span class="text-sm text-gray-500 dark:text-gray-400 font-mono">
          id: {storeData.id}
        </span>
        <a href={storeData.storefront_url} class="text-md text-blue-600 dark:text-blue-400 hover:underline">
          Visit Website
        </a>
      </div>
      <div class="grow-1"></div>
    </div>
  </div>
  <div class="flex w-1/2 md:w-4/6 justify-items-center">
    <div class="w-full border-l-1 pl-2 border-gray-200 dark:border-gray-700 hidden sm:block sm:w-1/2">
      <b>Ships from</b>
      <div class="flex flex-wrap space-x-1 mt-1">
        {#if storeData?.ships_from}
          {#if Array.isArray(storeData?.ships_from)}
            {#if storeData?.ships_from?.length > 0}
              {#each storeData?.ships_from as from}
                <CountryItem
                  code={from}
                />
              {/each}
            {/if}
          {:else if typeof(storeData?.ships_from) == "string"}
            {#if storeData?.ships_from != ""}
              <CountryItem
                code={storeData?.ships_from}
              />
            {/if}
          {/if}
        {/if}
      </div>
    </div>
    <div class="w-1/2 border-l-1 pl-2 border-gray-200 dark:border-gray-700 hidden md:block">
      <b>Ships to</b>
      <div class="flex flex-wrap space-x-1 mt-1">
        {#if storeData?.ships_to}
          {#if Array.isArray(storeData?.ships_to)}
            {#if storeData?.ships_to?.length > 0}
              {#each storeData?.ships_to as to}
                <CountryItem
                  code={to}
                />
              {/each}
            {/if}
          {:else if typeof(storeData?.ships_to) == "string"}
            {#if storeData?.ships_to != ""}
              <CountryItem
                code={storeData?.ships_to}
              />
            {/if}
          {/if}
        {/if}
      </div>
    </div>
  </div>
  <div class="w-fit h-fit absolute top-4 right-4">
    <a
      href={`/Store/${stripOfIllegalChars(storeData.id)}`}
      class="flex items-center gap-2 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-green-100 hover:text-green-700 dark:hover:bg-green-900 dark:hover:text-green-300 shadow transition-colors"
      title="Edit {storeData.name}">
      <Fa icon={faPen} />
      <span class="text-sm font-medium">Edit</span>
    </a>
  </div>
</div>
