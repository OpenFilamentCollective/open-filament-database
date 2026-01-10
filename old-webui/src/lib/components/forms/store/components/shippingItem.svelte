<script>
  import PurchaseTextField from "../../variant/components/purchaseTextField.svelte";
  import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";

  export let formVar, index, idPrefix, removeRegion, errors;
</script>

<div class="block grow-1 flex items-center mb-2">
  <span class="mr-2">
    {index + 1}.
  </span>
  <PurchaseTextField
    classes="grow-1"
    id="{idPrefix}_{index}"
    title=""
    placeholder="CA, US, DK"
    bind:formVar={formVar}
    errorVar={null}
  />
  <button
    type="button"
    onclick={removeRegion}
    class="mx-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200">
    <Fa icon={faTrashCan}/>
  </button>
</div>