<script lang="ts">
  import { page } from "$app/state";

  const crumbs = $derived(page.url.pathname.split('/').map(decodeURIComponent).filter(Boolean));

  const baseUrl = $derived(page.url.origin);
  const urlPath = (index: number) => {
    return '/' + crumbs.slice(0, index + 1).map(encodeURIComponent).join('/');
  };
</script>

<menu class="flex items-center justify-center">
  <ul class="flex items-center">
    <li>
      <a href={baseUrl} class="breadcrumb-link">Home</a>
    </li>
    {#each crumbs as crumb, i}
      <li class="flex items-center">
        <svg
          class="mx-2 h-4 w-4 text-gray-400"
          fill="none"
          stroke="red"
          stroke-width="2"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        <a href={baseUrl + urlPath(i)} class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">{crumb}</a>
      </li>
    {/each}
  </ul>
</menu>