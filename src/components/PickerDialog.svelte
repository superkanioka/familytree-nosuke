<script>
  import { dialogs } from "../lib/dialogs.svelte.js";
  import Icon from "./Icon.svelte";

  let dialog;
  let search = $state("");

  const picker = $derived(dialogs.picker);
  const shown = $derived.by(() => {
    if (!picker) return [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return picker.candidates;
    return picker.candidates.filter((p) => `${p.name}${p.relation}${p.years}`.toLowerCase().includes(keyword));
  });

  // ダイアログの開閉を picker 状態に同期させる。
  $effect(() => {
    if (!dialog) return;
    if (picker && !dialog.open) {
      search = "";
      dialog.showModal();
    } else if (!picker && dialog.open) {
      dialog.close();
    }
  });

  function initial(name) {
    return [...(name || "?")][0];
  }

  function cancel() {
    picker?.resolve(null);
  }
</script>

<dialog class="picker-dialog" bind:this={dialog} oncancel={(e) => { e.preventDefault(); cancel(); }} onclose={cancel}>
  {#if picker}
    <div class="dialog-head">
      <Icon name="people" />
      <h2 class="dialog-title">{picker.title}</h2>
    </div>
    <label class="picker-search">
      名前で絞り込む
      <input type="search" autocomplete="off" placeholder="例: 太郎" bind:value={search} />
    </label>
    <div class="picker-list">
      {#each shown as person (person.id)}
        <button type="button" class="picker-row" onclick={() => picker.resolve(person.id)}>
          <span class="person-avatar">{initial(person.name)}</span>
          <span class="picker-text">
            <span class="picker-name">{person.name}</span>
            <span class="picker-meta">{picker.describe(person)}</span>
          </span>
        </button>
      {/each}
    </div>
    {#if shown.length === 0}
      <p class="picker-empty">見つかりませんでした。</p>
    {/if}
    <div class="dialog-actions">
      <button type="button" class="text" onclick={cancel}>キャンセル</button>
    </div>
  {/if}
</dialog>
