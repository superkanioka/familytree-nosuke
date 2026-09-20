<script>
  import { store } from "./lib/store.svelte.js";
  import PersonForm from "./components/PersonForm.svelte";
  import PeopleList from "./components/PeopleList.svelte";
  import JsonPanel from "./components/JsonPanel.svelte";
  import Toolbar from "./components/Toolbar.svelte";
  import PreviewCanvas from "./components/PreviewCanvas.svelte";
  import PickerDialog from "./components/PickerDialog.svelte";
  import ConfirmDialog from "./components/ConfirmDialog.svelte";
  import Snackbar from "./components/Snackbar.svelte";
  import Icon from "./components/Icon.svelte";

  const smallScreen = window.matchMedia("(max-width: 920px)");
  let sheetOpen = $state(!smallScreen.matches);

  const pageRule = $derived(`@page { size: ${store.paperSpec.pageSize} ${store.paperSpec.orientation}; margin: 0; }`);

  $effect(() => {
    const onChange = (event) => { sheetOpen = !event.matches; };
    smallScreen.addEventListener("change", onChange);
    return () => smallScreen.removeEventListener("change", onChange);
  });

  // 文字入力中は、ブラウザ本来の取り消しを邪魔しない。
  $effect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select")) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        if (!store.undo()) store.setStatus("元に戻せる操作がありません。");
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        if (!store.redo()) store.setStatus("やり直せる操作がありません。");
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // PWA: インストール導線と Service Worker
  $effect(() => {
    const onPrompt = (event) => { event.preventDefault(); store.setInstallPrompt(event); };
    const onInstalled = () => { store.setInstallPrompt(null); store.setStatus("ホーム画面に追加しました。"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
      navigator.serviceWorker.register("sw.js").catch((error) => {
        console.warn("familytree: Service Workerを登録できませんでした", error);
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  });

  // ボタンにさざ波（Material のタッチ演出）
  $effect(() => {
    const onDown = (event) => {
      const target = event.target instanceof Element ? event.target.closest("button, .download-link") : null;
      if (!target || target.disabled) return;
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const ripple = document.createElement("span");
      ripple.className = "ripple";
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      ripple.addEventListener("animationend", () => ripple.remove());
      target.append(ripple);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  });

  $effect(() => {
    if (!store.storageOk) {
      store.setStatus("このブラウザではデータを保存できません（プライベートモードなどの可能性があります）。JSON書き出しでバックアップしてください。", { tone: "error", persistent: true });
    }
  });
</script>

<svelte:head>
  {@html `<style>${pageRule}</style>`}
</svelte:head>

<main class="app">
  <aside class="sidebar" class:is-open={sheetOpen}>
    <button type="button" class="sheet-handle" aria-expanded={sheetOpen} onclick={() => (sheetOpen = !sheetOpen)}>
      <span class="sheet-grip" aria-hidden="true"></span>
      <span class="sheet-label">人物を編集</span>
    </button>
    <div class="app-title">
      <span class="app-icon"><Icon name="tree" size={22} /></span>
      <div>
        <h1>家系図作成アプリ</h1>
        <p class="app-subtitle">Family tree composer</p>
      </div>
    </div>

    <PersonForm />
    <PeopleList />
    <JsonPanel />
  </aside>

  <section class="workspace">
    <Toolbar />
    <PreviewCanvas />
  </section>
</main>

<Snackbar />
<PickerDialog />
<ConfirmDialog />
