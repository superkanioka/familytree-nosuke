<script>
  import { dialogs } from "../lib/dialogs.svelte.js";
  import Icon from "./Icon.svelte";

  let dialog;
  const confirm = $derived(dialogs.confirm);

  $effect(() => {
    if (!dialog) return;
    if (confirm && !dialog.open) dialog.showModal();
    else if (!confirm && dialog.open) dialog.close();
  });

  function decide(result) {
    confirm?.resolve(result);
  }
</script>

<dialog bind:this={dialog} oncancel={(e) => { e.preventDefault(); decide(false); }} onclose={() => decide(false)}>
  {#if confirm}
    <div class="dialog-head">
      <Icon name="warning" />
      <h2 class="dialog-title">{confirm.title}</h2>
    </div>
    <p class="dialog-body">{confirm.body}</p>
    <div class="dialog-actions">
      <button type="button" class="text" onclick={() => decide(false)}>キャンセル</button>
      <button type="button" class={confirm.tone === "danger" ? "danger" : "primary"} onclick={() => decide(true)}>{confirm.okLabel}</button>
    </div>
  {/if}
</dialog>
