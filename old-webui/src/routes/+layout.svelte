<script lang="ts">
  import BackBtn from '$lib/components/backBtn.svelte';
  import Breadcrumb from '$lib/components/breadcrumb.svelte';
  import { getFlash, updateFlash } from 'sveltekit-flash-message';
  import '../app.css';
  import type { LayoutProps } from './$types';
  import { page } from '$app/state';
  import { env } from '$env/dynamic/public';
  const isDev = env.PUBLIC_IS_DEV === 'true';

  let flash = getFlash(page);
  let { children }: LayoutProps = $props();

  let currentYear = new Date().getFullYear();
</script>

{#if $flash}
  {@const isSuccess = $flash.type == 'success'}
  {@const isError = $flash.type == 'error'}
  <div class="fixed top-4 right-4 z-50 transform transition-all duration-300 ease-in-out">
    <div
      class="max-w-sm rounded-lg shadow-lg border-l-4 {isSuccess
        ? 'bg-green-50 border-green-500 dark:bg-green-900/20 dark:border-green-400'
        : 'bg-red-50 border-red-500 dark:bg-red-900/20 dark:border-red-400'}">
      <div class="flex items-center justify-between p-4">
        <div class="flex items-center space-x-3">
          {#if isSuccess}
            <svg
              class="w-6 h-6 text-green-600 dark:text-green-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"></path>
            </svg>
          {:else}
            <svg
              class="w-6 h-6 text-red-600 dark:text-red-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          {/if}
          <p
            class="font-medium text-sm {isSuccess
              ? 'text-green-800 dark:text-green-200'
              : 'text-red-800 dark:text-red-200'}">
            {$flash.message}
          </p>
        </div>

        <button
          aria-label="close"
          class="ml-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors flex-shrink-0"
          onclick={() => flash.set(undefined)}>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>
    </div>
  </div>
{/if}

<div
  class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100 transition-colors">
  <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 mb-12">
    <nav class="sm:px-6 lg:px-8 flex gap-4 align-center">
      <BackBtn />
      <Breadcrumb />
    </nav>
    {@render children()}
  </main>

  <footer
    class="bg-gray-900 dark:bg-gray-800 text-white text-center p-2 mt-5 shadow-inner"
    style="position: fixed; bottom: 0; width: 100vw; display: inline;"
  >
    © {currentYear} Open Filament Database – All rights reserved

    {#if isDev}
      <button
        style="float: right;"
        class="bg-red-900"
        onclick={async () => {
        const response = await fetch('/api/refreshData', {
          method: 'POST'
        });

        await updateFlash(page);

        location.reload();
      }}>
        Refresh DB Data
      </button>
    {/if}
  </footer>
</div>
