<script>
  import { drawFamilyTree } from "../draw.js";
  import { clamp } from "../data.js";
  import { store } from "../lib/store.svelte.js";

  let canvas;
  let wrap;
  let lastLayout = null;
  let draggedId = null;
  let dragOffset = { x: 0, y: 0 };

  function treeColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      marriage: styles.getPropertyValue("--marriage").trim() || "#8f4b53",
      child: styles.getPropertyValue("--child").trim() || "#3f4947"
    };
  }

  function render() {
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const width = Math.max(900, Math.round(rect.width * window.devicePixelRatio));
    const height = Math.round(width / store.paperSpec.ratio);
    canvas.width = width;
    canvas.height = height;
    lastLayout = drawFamilyTree(canvas, store.people, treeColors(), store.photoImages);
  }

  // 人物・用紙・写真の読み込みが変わるたびに描き直す。
  $effect(() => {
    store.people;
    store.paperSize;
    store.photoVersion;
    render();
  });

  $effect(() => {
    const onResize = () => render();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  });

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function hitTest(point) {
    if (!lastLayout) return null;
    for (let i = lastLayout.people.length - 1; i >= 0; i -= 1) {
      const person = lastLayout.people[i];
      const pos = lastLayout.positions.get(person.id);
      if (!pos) continue;
      if (Math.abs(point.x - pos.x) <= lastLayout.box.w / 2 && Math.abs(point.y - pos.y) <= lastLayout.box.h / 2) {
        return { person, pos };
      }
    }
    return null;
  }

  function onPointerDown(event) {
    const hit = hitTest(canvasPoint(event));
    if (!hit) return;
    if (hit.person.id !== store.selectedId) store.selectPerson(hit.person.id);
    if (!store.manualLayoutMode) return;
    draggedId = hit.person.id;
    const point = canvasPoint(event);
    dragOffset = { x: point.x - hit.pos.x, y: point.y - hit.pos.y };
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function onPointerMove(event) {
    if (draggedId === null || !store.manualLayoutMode || !lastLayout) return;
    const point = canvasPoint(event);
    const x = clamp(point.x - dragOffset.x, lastLayout.box.w / 2 + 12, canvas.width - lastLayout.box.w / 2 - 12);
    const y = clamp(point.y - dragOffset.y, lastLayout.box.h / 2 + 12, canvas.height - lastLayout.box.h / 2 - 12);
    store.setPersonPosition(draggedId, x / canvas.width, y / canvas.height);
    render();
    event.preventDefault();
  }

  function onPointerUp(event) {
    if (draggedId === null) return;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    draggedId = null;
    store.commitPositions();
  }
</script>

<div class="canvas-wrap" bind:this={wrap}>
  <div class="paper" class:is-manual={store.manualLayoutMode} style={`aspect-ratio:${store.paperSpec.widthMm} / ${store.paperSpec.heightMm};--paper-ratio:${store.paperSpec.ratio}`}>
    <canvas
      bind:this={canvas}
      aria-label="家系図プレビュー"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    ></canvas>
  </div>
</div>
