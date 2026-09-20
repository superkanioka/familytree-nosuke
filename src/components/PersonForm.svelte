<script>
  import {
    GENDER_LABELS,
    PARENT_RELATIONSHIP_LABELS,
    SPOUSE_RELATIONSHIP_LABELS,
    describeRelations
  } from "../data.js";
  import { store } from "../lib/store.svelte.js";
  import { openPicker, openConfirm } from "../lib/dialogs.svelte.js";
  import Icon from "./Icon.svelte";

  const relationSuggestions = ["本人", "父", "母", "祖父", "祖母", "長男", "長女", "次男", "次女", "養子", "配偶者"];

  let errors = $state({});
  let photoInput;

  const draft = $derived(store.draft);
  // 下書きが差し替わったらエラー表示はリセット
  $effect(() => {
    store.draft;
    errors = {};
  });

  function nameOf(id) {
    return store.people.find((p) => p.id === id)?.name || `#${id}`;
  }

  async function pickParent() {
    const exclude = store.parentExcludeIds();
    const candidates = store.people.filter((p) => !exclude.includes(p.id));
    const id = await openPicker({ title: "親を選ぶ", candidates, describe: (p) => describeRelations(p, store.people) });
    if (id !== null) store.addParent(id);
  }

  async function pickSpouse() {
    const exclude = store.spouseExcludeIds();
    const candidates = store.people.filter((p) => !exclude.includes(p.id));
    const id = await openPicker({ title: "配偶者を選ぶ", candidates, describe: (p) => describeRelations(p, store.people) });
    if (id !== null) store.addSpouse(id);
  }

  function onSubmit(event) {
    event.preventDefault();
    errors = store.save();
  }

  async function onPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await store.choosePhoto(file);
  }

  async function onDelete() {
    const target = store.people.find((p) => p.id === store.selectedId);
    if (!target) {
      store.setStatus("削除する人物が選ばれていません。人物一覧から選んでください。");
      return;
    }
    const name = target.name || `#${target.id}`;
    const ok = await openConfirm({
      title: "人物を削除",
      body: `「${name}」を削除します。この人物を親・配偶者として参照している関係も外れます。`,
      okLabel: "削除"
    });
    if (ok) store.deleteSelected();
  }
</script>

<section class="card">
  <div class="card-head">
    <Icon name="person" />
    <h2>人物を編集</h2>
  </div>
  <form novalidate onsubmit={onSubmit}>
    <label>
      氏名
      <input type="text" autocomplete="off" bind:value={draft.name} class:is-invalid={errors.name} />
      {#if errors.name}<span class="field-error">{errors.name}</span>{/if}
    </label>

    <label>
      続柄
      <div class="inline-field">
        <input type="text" list="relationSuggestions" placeholder="例: 長男、母、配偶者" bind:value={draft.relation} />
        <button type="button" class="secondary" onclick={() => store.suggestRelation()}>
          <Icon name="bulb" /><span class="btn-label">候補</span>
        </button>
      </div>
      <datalist id="relationSuggestions">
        {#each relationSuggestions as value}<option {value}></option>{/each}
      </datalist>
    </label>

    <div class="grid-2">
      <label>
        生没年
        <input type="text" placeholder="1930-2005" value={draft.years} oninput={(e) => store.onYearsInput(e.target.value)} />
      </label>
      <label>
        世代
        <input type="number" min="0" max="12" bind:value={draft.generation} class:is-invalid={errors.generation} />
        {#if errors.generation}<span class="field-error">{errors.generation}</span>{/if}
      </label>
    </div>

    <div class="grid-2">
      <label>
        性別
        <select bind:value={draft.gender}>
          {#each Object.entries(GENDER_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
        </select>
      </label>
      <label class="checkbox-field">
        表示
        <span class="checkbox-row">
          <input type="checkbox" bind:checked={draft.deceased} onchange={() => store.markDeceasedTouched()} />
          <span>故人として表示</span>
        </span>
      </label>
    </div>

    <label>
      備考
      <input type="text" placeholder="例: 東京在住" bind:value={draft.memo} />
    </label>

    <div class="relation-field">
      <div class="relation-head">
        <span class="relation-label">写真</span>
        <span class="photo-actions">
          <button type="button" class="tonal-sm" onclick={() => photoInput.click()}><Icon name="image" size={16} />選ぶ</button>
          {#if draft.photo}
            <button type="button" class="icon-button" title="写真を外す" aria-label="写真を外す" onclick={() => store.removePhoto()}><Icon name="close" size={16} /></button>
          {/if}
        </span>
      </div>
      <div class="photo-preview">
        {#if draft.photo}
          <img src={draft.photo} alt="選択中の写真" />
        {:else}
          <span class="photo-empty">未設定</span>
        {/if}
      </div>
      <input type="file" accept="image/*" hidden bind:this={photoInput} onchange={onPhoto} />
    </div>

    <div class="relation-field">
      <div class="relation-head">
        <span class="relation-label">親</span>
        <button type="button" class="tonal-sm" onclick={pickParent}><Icon name="add" size={16} />親を選ぶ</button>
      </div>
      <div class="relation-list">
        {#each draft.parents as entry, index}
          <div class="relation-row">
            <span class="relation-name">{nameOf(entry.id)}</span>
            <select aria-label={`${nameOf(entry.id)}との関係`} bind:value={entry.type}>
              {#each Object.entries(PARENT_RELATIONSHIP_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
            </select>
            <button type="button" class="icon-button" title="親から外す" aria-label={`${nameOf(entry.id)}を親から外す`} onclick={() => store.removeParent(index)}><Icon name="close" size={16} /></button>
          </div>
        {/each}
      </div>
    </div>

    <div class="relation-field">
      <div class="relation-head">
        <span class="relation-label">配偶者</span>
        <button type="button" class="tonal-sm" onclick={pickSpouse}><Icon name="add" size={16} />配偶者を選ぶ</button>
      </div>
      <div class="relation-list">
        {#each draft.spouses as entry, index}
          <div class="relation-row">
            <span class="relation-name">{nameOf(entry.id)}</span>
            <select aria-label={`${nameOf(entry.id)}との関係`} bind:value={entry.type}>
              {#each Object.entries(SPOUSE_RELATIONSHIP_LABELS) as [value, label]}<option {value}>{label}</option>{/each}
            </select>
            <button type="button" class="icon-button" title="配偶者から外す" aria-label={`${nameOf(entry.id)}を配偶者から外す`} onclick={() => store.removeSpouse(index)}><Icon name="close" size={16} /></button>
          </div>
        {/each}
      </div>
    </div>

    <div class="actions">
      <button type="submit"><Icon name="check" /><span class="btn-label">保存</span></button>
      <button type="button" class="secondary" onclick={() => store.newPerson()}><Icon name="add" /><span class="btn-label">新規</span></button>
      <button type="button" class="danger" onclick={onDelete}><Icon name="delete" /><span class="btn-label">削除</span></button>
    </div>
  </form>
</section>
