<script>
  import { store } from "../lib/store.svelte.js";
  import { openConfirm } from "../lib/dialogs.svelte.js";
  import Icon from "./Icon.svelte";

  let fileInput;
  let downloadUrl = $state("");
  let downloadName = $state("");

  function formatBackupTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "保存日時不明";
    return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function exportJson() {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = store.exportJsonBlobUrl();
    downloadName = `familytree-${new Date().toISOString().slice(0, 10)}.json`;
    store.setStatus("JSONを書き出しました。表示されたリンクをクリックして保存してください。");
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await store.importJsonFile(file);
  }

  async function onSample() {
    const ok = await openConfirm({
      title: "サンプルデータを復元",
      body: "現在の人物データをすべてサンプルに置き換えます。「元に戻す」で取り消せます。",
      okLabel: "置き換える"
    });
    if (ok) store.restoreSample();
  }

  async function onRestore(backup) {
    const ok = await openConfirm({
      title: "バックアップから復元",
      body: `${formatBackupTime(backup.savedAt)} 時点の${backup.count ?? "?"}人のデータに戻します。現在の内容は置き換わりますが、「元に戻す」で取り消せます。`,
      okLabel: "復元"
    });
    if (ok) store.restoreBackup(backup);
  }
</script>

<section class="card">
  <div class="card-head">
    <Icon name="code" />
    <h2>JSON</h2>
  </div>
  <label>
    データ
    <textarea spellcheck="false" bind:value={store.jsonText}></textarea>
  </label>
  <div class="actions">
    <button type="button" class="secondary" onclick={() => store.applyJsonText()}><Icon name="check" /><span class="btn-label">JSON反映</span></button>
    <button type="button" class="secondary" onclick={exportJson}><Icon name="download" /><span class="btn-label">JSON書き出し</span></button>
    <button type="button" class="secondary" onclick={() => fileInput.click()}><Icon name="upload" /><span class="btn-label">JSON読込</span></button>
    <button type="button" class="secondary" onclick={onSample}><Icon name="sparkle" /><span class="btn-label">サンプル復元</span></button>
    <input type="file" accept="application/json,.json" hidden bind:this={fileInput} onchange={onImport} />
  </div>
  {#if downloadUrl}
    <div class="download-box is-visible">
      <a class="download-link" href={downloadUrl} download={downloadName}><Icon name="download" />JSONファイルを保存</a>
    </div>
  {/if}

  {#if store.backups.length}
    <div class="backup-box">
      <div class="card-head">
        <Icon name="history" />
        <h2>自動バックアップ</h2>
      </div>
      <div class="backup-list">
        {#each store.backups as backup}
          <div class="backup-row">
            <div class="backup-label">{formatBackupTime(backup.savedAt)} / {backup.count ?? "?"}人</div>
            <button type="button" class="secondary" onclick={() => onRestore(backup)}>復元</button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</section>
