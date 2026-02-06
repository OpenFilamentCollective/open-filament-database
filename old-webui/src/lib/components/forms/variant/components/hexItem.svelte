<script>
  import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";
  import HexPicker from "./hexPicker.svelte";

  export let formVar, index, idPrefix, removeHex, errors;
</script>

<div class="block grow-1 flex items-center mb-2">
  <span class="mr-2">
    {index + 1}.
  </span>
  <HexPicker
    bind:formVar={formVar}
    id="{idPrefix}{index}"
    placeholder="#000000"
    errorVar={errors}
  />
  <button
    type="button"
    onclick={removeHex}
    class="mx-2 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200">
    <Fa icon={faTrashCan}/>
  </button>
</div>