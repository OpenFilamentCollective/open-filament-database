<script>
  export let link, title, images = undefined;

  let offsets = [];

  // Generate slight randomness for each image
  function getRandomStyle(index) {
    if (offsets[index]) {
      return offsets[index];
    }

    const angleMap = [-60, 0, 60]; // half-arc layout
    const baseAngle = angleMap[index];
    const rotation = (Math.random() - 0.5) * 10; // ±5 deg
    const yOffset = (Math.random() - 0.5) * 20;  // ±10px
    const xOffset = (Math.random() - 0.5) * 5;  // ±5px

    offsets[index] = `
      transform: rotate(${baseAngle}deg) 
                 translateY(-40%) 
                 translateX(${xOffset}px)
                 rotate(${rotation}deg)
                 rotate(${-baseAngle}deg); /* Undo base rotation for image itself */
    `;

    return offsets[index];
  }
</script>

<a
  href={link}
  class="flex flex-col items-center justify-center p-6 min-h-100 bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 space-y-4 w-full border border-gray-200 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100 text-gray-900">
  {#if images && images?.length > 0}
    <div class="w-full rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700">
      <div class="relative w-[500px] h-[300px]">
      <div class="absolute inset-0 flex items-center justify-center">
      {#each images as url, i}
        <img
          src={url}
          alt={`${title} Logo`}
          class="w-30"
          style={getRandomStyle(i)}
        />
      {/each}
      </div>
      </div>
    </div>
  {/if}

  <h2 class="text-lg font-bold text-gray-800 dark:text-gray-100 text-center">
    {title}
  </h2>
</a>