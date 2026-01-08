<script lang="ts">
  import SectionsItem from "$lib/components/items/sectionsItem.svelte";
  const { data } = $props();

  let filamentData = data.filamentData;

  let brandImages = [], storeImages = [];

  function getRandomInt(max) {
    return Math.floor(Math.random() * max);
  }

  type imageSourceType = "brand" | "store";

  function getRandomImage(dict, arr, sourceType: imageSourceType) {
    let index = getRandomInt(Object.keys(dict).length - 1);
    let sourceKey = Object.keys(dict)[index];
    let source = dict[sourceKey];
    
    if (!arr.includes(source.logo)) {
      if (sourceType == "brand") {
        return `/data/${source.id}/${source.logo}`;
      } else {
        return `/stores/${source.id}/${source.logo}`
      }
    } else {
      sourceKey = Object.keys(dict)[index + 1];
      let source = dict[sourceKey];

      if (sourceType == "brand") {
        return `/data/${source.id}/${source.logo}`;
      } else {
        return `/stores/${source.id}/${source.logo}`
      }
    }
  }

  for(let i = 0; i < 3; i++){
    brandImages[i] = getRandomImage(filamentData.brands, brandImages, "brand");
    storeImages[i] = getRandomImage(filamentData.stores, storeImages, "store");
  }
</script>

<svelte:head>
	<title>WebUI Landing</title>
	<meta name="description" content="This is a overview of the sections of the webui"/>
</svelte:head>

<section class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-screen flex-col">
  <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100 text-center">Open Filament Database WebUI</h1>
  <p class="mb-8 text-center">Hello and welcome to our WebUI, below you can select whether you'd like to edit our brands or stores.</p>

  <div class="flex w-full aspect-3/1 space-x-4">
    <SectionsItem
      link="/Brand/"
      title="Filament Brands"
      images={brandImages}
    />

    <SectionsItem
      link="/Store/"
      title="Filament Storefronts"
      images={storeImages}
    />
  </div>

</section>
