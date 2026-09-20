<script>
  import { store } from "../lib/store.svelte.js";

  const bar = $derived(store.snackbar);
</script>

{#if bar.visible}
  <div class="snackbar" class:is-error={bar.tone === "error"}>
    <p class="status" role="status" aria-live="polite">{bar.message}</p>
    {#if bar.canUndo}
      <button type="button" class="snackbar-action" onclick={() => store.undo()}>元に戻す</button>
    {/if}
  </div>
{/if}
