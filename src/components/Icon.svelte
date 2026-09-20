<script>
  let { name, size = 20 } = $props();
</script>

<svg class="icon" width={size} height={size} aria-hidden="true">
  <use href={`#ic-${name}`} />
</svg>
