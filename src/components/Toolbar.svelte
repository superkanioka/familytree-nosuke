<script>
  import { PAPER_SIZES } from "../data.js";
  import { drawFamilyTree } from "../draw.js";
  import { store } from "../lib/store.svelte.js";
  import Icon from "./Icon.svelte";

  // 印刷と同じ用紙比率で、画面表示より高い解像度の画像を作る（約150dpi）。
  const PNG_PIXELS_PER_MM = 6;

  const summary = $derived(`${store.people.length}人`);
  const layoutSummary = $derived.by(() => {
    const generations = [...new Set(store.people.map((p) => p.generation))].sort((a, b) => a - b);
    const label = store.paperSpec.label;
    return generations.length ? `${generations[0]}〜${generations.at(-1)}世代 / ${label}` : label;
  });

  function treeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      marriage: styles.getPropertyValue("--marriage").trim() || "#8f4b53",
      child: styles.getPropertyValue("--child").trim() || "#3f4947"
    };
  }

  function exportPng() {
    const spec = store.paperSpec;
    const target = document.createElement("canvas");
    target.width = Math.round(spec.widthMm * PNG_PIXELS_PER_MM);
    target.height = Math.round(spec.heightMm * PNG_PIXELS_PER_MM);
    drawFamilyTree(target, store.people, treeColors(), store.photoImages);
    const fileName = `familytree-${new Date().toISOString().slice(0, 10)}.png`;
    target.toBlob(async (blob) => {
      if (!blob) {
        store.setStatus("画像を作れませんでした。", { tone: "error" });
        return;
      }
      const file = new File([blob], fileName, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: "家系図" });
          store.setStatus("画像を共有しました。");
          return;
        } catch (error) {
          if (error?.name === "AbortError") return;
        }
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      store.setStatus(`${spec.label}の画像を保存しました。`);
    }, "image/png");
  }
</script>

<div class="toolbar">
  <strong class="chip">{summary}</strong>
  <span class="chip chip-outline">{layoutSummary}</span>
  <button type="button" class="icon-button" title="元に戻す (Ctrl+Z)" aria-label="元に戻す" disabled={store.history.past.length === 0} onclick={() => store.undo()}><Icon name="undo" /></button>
  <button type="button" class="icon-button" title="やり直す (Ctrl+Shift+Z)" aria-label="やり直す" disabled={store.history.future.length === 0} onclick={() => store.redo()}><Icon name="redo" /></button>
  <span class="spacer"></span>
  <label class="toolbar-size">
    用紙サイズ
    <select value={store.paperSize} onchange={(e) => store.setPaperSize(e.target.value)}>
      {#each Object.values(PAPER_SIZES) as spec}<option value={spec.key}>{spec.label}</option>{/each}
    </select>
  </label>
  <button type="button" class="secondary" onclick={() => store.toggleManualLayout()} aria-pressed={store.manualLayoutMode}>
    <Icon name="move" /><span class="btn-label">{store.manualLayoutMode ? "配置調整を終了" : "配置調整"}</span>
  </button>
  <button type="button" class="secondary" onclick={() => store.resetManualLayout()}><Icon name="restore" /><span class="btn-label">自動配置に戻す</span></button>
  <button type="button" class="secondary" onclick={exportPng}><Icon name="image" /><span class="btn-label">画像で保存</span></button>
  {#if store.installPrompt}
    <button type="button" class="secondary" onclick={() => store.runInstall()}><Icon name="install" /><span class="btn-label">アプリとして追加</span></button>
  {/if}
  <button type="button" onclick={() => window.print()}><Icon name="print" /><span class="btn-label">印刷</span></button>
</div>
