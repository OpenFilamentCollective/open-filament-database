<script>
  import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import Fa from "svelte-fa";

  let { handleDelete } = $props();
</script>

<button
  type="button"
  class="w-full flex items-center justify-center gap-2 mt-2 py-2 px-4 rounded-lg bg-red-600 text-white font-semibold shadow hover:bg-red-700 transition-colors"
  aria-label="Delete brand"
  onclick={handleDelete}>
  <Fa icon={faTrashCan}/>
  Delete
</button>