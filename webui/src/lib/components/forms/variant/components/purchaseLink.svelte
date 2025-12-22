<script>
  import { writable } from "svelte/store";
  import PurchaseCheck from "./purchaseCheck.svelte";
  import PurchaseTextField from "./purchaseTextField.svelte";
  import { onMount } from "svelte";
  import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import PurchaseDropdown from "./purchaseDropdown.svelte";

  export let link, purchaseIndex, sizeIndex, removePurchaseLink, errors, stores;
  let localLink = writable({});

  onMount(() => {
    localLink.set(structuredClone(link));
  });

  localLink.subscribe((value) => {
    // If this print statement is removed links completely break...
    console.log("changing link from: ", link, "to: ", value);
    link = value;
  });
</script>

<div
  class="border border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-2 bg-gray-50 dark:bg-gray-800">
  <div class="flex justify-between items-center mb-4">
    <h4 class="font-medium text-gray-700 dark:text-gray-300">
      Purchase Link {purchaseIndex + 1}
    </h4>
      <button
        type="button"
        onclick={removePurchaseLink}
        class="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200">
        <Fa icon={faTrashCan}/>
      </button>
  </div>

  <div class="space-y-4">
    <!-- TODO: Replace with dropdown ones store infra exists -->
    <PurchaseDropdown
      id="sizes_{sizeIndex}_store_id_{purchaseIndex}"
      title="Store ID"
      options={stores}
      bind:formVar={$localLink.store_id}
      errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.store_id?.[0]}
      required={true}
    />

    <!--<PurchaseTextField
      id="sizes_{sizeIndex}_store_id_{purchaseIndex}"
      title="Store ID"
      placeholder="amazon-us"
      bind:formVar={$localLink.store_id}
      errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.store_id?.[0]}
      required={true}
    />-->

    <PurchaseTextField
      id="sizes_{sizeIndex}_url_{purchaseIndex}"
      title="Purchase URL"
      placeholder="https://www.store.com/product/12345"
      bind:formVar={$localLink.url}
      errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.url?.[0]}
      required={true}
    />

    <div class="grid grid-cols-2 gap-3">

      <PurchaseCheck
        id="sizes_{sizeIndex}_spool_refill_{purchaseIndex}"
        title="Is spool refill"
        bind:formVar={$localLink.spool_refill}
        errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.spool_refill?.[0]}
      />
    </div>

    <div class="grid grid-cols-2 gap-3">
      <PurchaseTextField
        id="sizes_{sizeIndex}_ships_from_{purchaseIndex}"
        title="Ships from"
        placeholder="US"
        bind:formVar={$localLink.ships_from}
        errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.ships_from?.[0]}
      />

      <PurchaseTextField
        id="sizes_{sizeIndex}_ships_to_{purchaseIndex}"
        title="Ships to"
        placeholder="EU"
        bind:formVar={$localLink.ships_to}
        errorVar={$errors?.sizes?.[sizeIndex]?.purchase_links?.[purchaseIndex]?.ships_to?.[0]}
      />
    </div>
  </div>
</div>