<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from "$app/state";
  import Fa from 'svelte-fa';
  import { faArrowUp } from '@fortawesome/free-solid-svg-icons';

  const crumbs = $derived(page.url.pathname.split('/').map(decodeURIComponent).filter(Boolean));
    
  function goBack() {
    goto('/' + crumbs.slice(0, crumbs.length-1).map(encodeURIComponent).join('/'));
  }
</script>

<menu>
  <button
    class="flex items-center justify-center h-10 w-10 p-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 transition-colors cursor-pointer"
    onclick={goBack}
    aria-label="Go back"
  >
    <Fa icon={faArrowUp} />
  </button>
</menu>