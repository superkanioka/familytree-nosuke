// 画面の組み立てとイベント配線。DOM・localStorage・印刷まわりはここだけに置く。
import {
  DEFAULT_PAPER_SIZE,
  PAPER_SIZES,
  buildParentRelationshipTypes,
  buildSpouseRelationshipTypes,
  nextId,
  normalizePeople,
  parseParentIds,
  parseSpouseIds,
  samplePeople,
  suggestRelationFor,
  toNullableNumber
} from "./data.js";
import { drawFamilyTree } from "./draw.js";


const PEOPLE_KEY = "familytree.people";

const PAPER_KEY = "familytree.paperSize";

const BACKUP_KEY = "familytree.backups";

const BACKUP_LIMIT = 5;

let people = loadPeople();

let paperSize = loadPaperSize();

let selectedId = people[0]?.id ?? 1;

let manualLayoutMode = false;

let draggedPersonId = null;

let dragOffset = { x: 0, y: 0 };

let lastLayout = null;

const form = document.getElementById("personForm");

const fields = {
  id: document.getElementById("personId"),
  name: document.getElementById("name"),
  years: document.getElementById("years"),
  generation: document.getElementById("generation"),
  spouseId: document.getElementById("spouseId"),
  relationshipType: document.getElementById("relationshipType"),
  relation: document.getElementById("relation"),
  parentIds: document.getElementById("parentIds"),
  parentRelationshipType: document.getElementById("parentRelationshipType")
};

const canvas = document.getElementById("treeCanvas");

const peopleList = document.getElementById("peopleList");

const jsonEditor = document.getElementById("jsonEditor");

const status = document.getElementById("status");

const summary = document.getElementById("summary");

const layoutSummary = document.getElementById("layoutSummary");

const paperSizeSelect = document.getElementById("paperSize");

const paper = document.querySelector(".paper");

const jsonDownloadBox = document.getElementById("jsonDownloadBox");

const jsonDownloadLink = document.getElementById("jsonDownloadLink");

const jsonFileInput = document.getElementById("jsonFileInput");

const snackbar = document.getElementById("snackbar");

const undoBtn = document.getElementById("undoBtn");

const backupBox = document.getElementById("backupBox");

const backupList = document.getElementById("backupList");

const confirmDialog = document.getElementById("confirmDialog");

const confirmTitle = document.getElementById("confirmTitle");

const confirmBody = document.getElementById("confirmBody");

const confirmOkBtn = document.getElementById("confirmOkBtn");

const confirmCancelBtn = document.getElementById("confirmCancelBtn");

let lastJsonUrl = "";

let pendingUndo = null;

function getPaperSpec() {
  return PAPER_SIZES[paperSize] || PAPER_SIZES[DEFAULT_PAPER_SIZE];
}

function loadPaperSize() {
  try {
    const saved = localStorage.getItem(PAPER_KEY);
    return PAPER_SIZES[saved] ? saved : DEFAULT_PAPER_SIZE;
  } catch {
    return DEFAULT_PAPER_SIZE;
  }
}

function savePaperSize() {
  try {
    localStorage.setItem(PAPER_KEY, paperSize);
  } catch (error) {
    console.warn("familytree: 用紙サイズを保存できませんでした", error);
  }
}

function applyPaperSize() {
  const spec = getPaperSpec();
  paperSizeSelect.value = spec.key;
  paper.style.aspectRatio = `${spec.widthMm} / ${spec.heightMm}`;
  paper.dataset.paperSize = spec.key;
  paper.dataset.paperDimensions = `${spec.widthMm}x${spec.heightMm}mm`;
  document.documentElement.style.setProperty("--paper-ratio", `${spec.widthMm} / ${spec.heightMm}`);
  document.documentElement.style.setProperty("--paper-width-mm", spec.widthMm);
  document.documentElement.style.setProperty("--paper-height-mm", spec.heightMm);
  const printStyle = document.getElementById("printPaperStyle");
  printStyle.textContent = `@page { size: ${spec.label} landscape; margin: 0; }`;
}

function loadPeople() {
  try {
    const saved = localStorage.getItem(PEOPLE_KEY);
    return saved ? normalizePeople(JSON.parse(saved)) : normalizePeople(structuredClone(samplePeople));
  } catch {
    return normalizePeople(structuredClone(samplePeople));
  }
}

function savePeople() {
  try {
    localStorage.setItem(PEOPLE_KEY, JSON.stringify(people, null, 2));
  } catch (error) {
    console.warn("familytree: 保存できませんでした", error);
    return false;
  }
  pushBackup();
  return true;
}

function loadBackups() {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => typeof item?.json === "string") : [];
  } catch {
    return [];
  }
}

function pushBackup() {
  try {
    const json = JSON.stringify(people);
    const backups = loadBackups();
    if (backups[0]?.json === json) return;
    backups.unshift({ savedAt: new Date().toISOString(), count: people.length, json });
    localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, BACKUP_LIMIT)));
  } catch (error) {
    console.warn("familytree: バックアップを保存できませんでした", error);
  }
}

function formatBackupTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "保存日時不明";
  return date.toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function renderBackups() {
  const current = JSON.stringify(people);
  const backups = loadBackups().filter((backup) => backup.json !== current);
  backupList.innerHTML = "";
  backupBox.hidden = backups.length === 0;
  for (const backup of backups) {
    const row = document.createElement("div");
    row.className = "backup-row";
    const label = document.createElement("div");
    label.className = "backup-label";
    label.textContent = `${formatBackupTime(backup.savedAt)} / ${backup.count ?? "?"}人`;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "secondary";
    restore.textContent = "復元";
    restore.addEventListener("click", () => restoreBackup(backup));
    row.append(label, restore);
    backupList.append(row);
  }
}

async function restoreBackup(backup) {
  const confirmed = await confirmAction({
    title: "バックアップから復元",
    body: `${formatBackupTime(backup.savedAt)} 時点の${backup.count ?? "?"}人のデータに戻します。現在の内容は置き換わりますが、「元に戻す」で取り消せます。`,
    okLabel: "復元"
  });
  if (!confirmed) return;
  const previous = snapshot();
  try {
    applyPeopleData(JSON.parse(backup.json), "バックアップから復元しました。", { undo: previous });
  } catch (error) {
    setStatus(`バックアップを読み込めませんでした: ${error.message}`, { tone: "error" });
  }
}

function checkStorage() {
  try {
    localStorage.setItem("familytree.probe", "1");
    localStorage.removeItem("familytree.probe");
    return true;
  } catch {
    return false;
  }
}

function snapshot() {
  return { people: structuredClone(people), selectedId };
}

function restoreSnapshot(saved) {
  people = normalizePeople(saved.people);
  selectedId = saved.selectedId ?? people[0]?.id ?? null;
  persistAndRender("元に戻しました。");
}

function confirmAction({ title, body, okLabel = "削除" }) {
  if (typeof confirmDialog.showModal !== "function") {
    return Promise.resolve(window.confirm(`${title}\n${body}`));
  }
  // A second request while a dialog is already open (double click) is dropped
  // instead of throwing on showModal().
  if (confirmDialog.open) return Promise.resolve(false);
  confirmTitle.textContent = title;
  confirmBody.textContent = body;
  confirmOkBtn.textContent = okLabel;
  confirmDialog.returnValue = "cancel";
  return new Promise((resolve) => {
    // Resolve from the buttons themselves: relying on the dialog "close" event
    // alone is fragile, so the click handlers decide and close the dialog.
    const finish = (result) => {
      confirmOkBtn.removeEventListener("click", handleOk);
      confirmCancelBtn.removeEventListener("click", handleCancel);
      confirmDialog.removeEventListener("cancel", handleCancel);
      confirmDialog.removeEventListener("close", handleClose);
      if (confirmDialog.open) confirmDialog.close(result ? "ok" : "cancel");
      resolve(result);
    };
    const handleOk = () => finish(true);
    const handleCancel = () => finish(false);
    const handleClose = () => finish(confirmDialog.returnValue === "ok");
    confirmOkBtn.addEventListener("click", handleOk);
    confirmCancelBtn.addEventListener("click", handleCancel);
    confirmDialog.addEventListener("cancel", handleCancel);
    confirmDialog.addEventListener("close", handleClose);
    confirmDialog.showModal();
  });
}

function setStatus(message, options = {}) {
  const { tone = "default", persistent = false, undo = null } = options;
  status.textContent = message;
  snackbar.hidden = !message;
  snackbar.classList.toggle("is-error", tone === "error");
  pendingUndo = undo;
  undoBtn.hidden = !undo;
  window.clearTimeout(setStatus.timer);
  if (!message || persistent) return;
  setStatus.timer = window.setTimeout(hideStatus, undo ? 10000 : 4000);
}

function hideStatus() {
  status.textContent = "";
  snackbar.hidden = true;
  snackbar.classList.remove("is-error");
  undoBtn.hidden = true;
  pendingUndo = null;
}

function selectPerson(id) {
  selectedId = id;
  const person = people.find((item) => item.id === id);
  if (!person) {
    fields.id.value = nextId(people);
    fields.name.value = "";
    fields.relation.value = "";
    fields.years.value = "";
    fields.generation.value = 0;
    fields.spouseId.value = "";
    fields.relationshipType.value = "married";
    fields.parentIds.value = "";
    fields.parentRelationshipType.value = "biological";
    return;
  }
  fields.id.value = person.id;
  fields.name.value = person.name;
  fields.relation.value = person.relation;
  fields.years.value = person.years;
  fields.generation.value = person.generation;
  fields.spouseId.value = person.spouseIds.join(",");
  const spouseTypes = person.spouseIds.map((spouseId) => person.spouseRelationshipTypes[String(spouseId)] || person.relationshipType || "married");
  fields.relationshipType.value = spouseTypes.length && spouseTypes.every((type) => type === spouseTypes[0]) ? spouseTypes[0] : "mixed";
  fields.parentIds.value = person.parentIds.join(",");
  const parentTypes = person.parentIds.map((parentId) => person.parentRelationshipTypes[String(parentId)] || "biological");
  fields.parentRelationshipType.value = parentTypes.length && parentTypes.every((type) => type === parentTypes[0]) ? parentTypes[0] : "mixed";
}

function suggestRelation() {
  const suggestion = suggestRelationFor({
    people,
    currentId: toNullableNumber(fields.id.value),
    parentIds: parseParentIds(fields.parentIds.value),
    hasSpouse: Boolean(toNullableNumber(fields.spouseId.value)),
    generation: Number(fields.generation.value)
  });
  fields.relation.value = suggestion.relation;
  setStatus(suggestion.message);
}

function upsertPerson(event) {
  event.preventDefault();
  const previousPerson = people.find((item) => item.id === Number(fields.id.value));
  const spouseIds = parseSpouseIds(fields.spouseId.value);
  const person = {
    id: Number(fields.id.value),
    name: fields.name.value.trim(),
    relation: fields.relation.value.trim(),
    years: fields.years.value.trim(),
    generation: Number(fields.generation.value),
    position: previousPerson?.position || null,
    spouseId: spouseIds[0] ?? null,
    spouseIds,
    spouseRelationshipTypes: buildSpouseRelationshipTypes(fields.spouseId.value, fields.relationshipType.value, previousPerson?.spouseRelationshipTypes),
    parentIds: parseParentIds(fields.parentIds.value),
    parentRelationshipTypes: buildParentRelationshipTypes(fields.parentIds.value, fields.parentRelationshipType.value, previousPerson?.parentRelationshipTypes),
    relationshipType: fields.relationshipType.value,
    relationshipMeta: previousPerson?.relationshipMeta || {}
  };

  if (!person.id || !person.name || !Number.isFinite(person.generation)) {
    setStatus("ID、氏名、世代を確認してください。");
    return;
  }
  if (person.spouseIds.includes(person.id)) {
    setStatus("配偶者IDに自分自身は指定できません。");
    return;
  }
  if (person.parentIds.includes(person.id)) {
    setStatus("親IDに自分自身は指定できません。");
    return;
  }

  const sameIdIndex = people.findIndex((item) => item.id === person.id);
  if (sameIdIndex >= 0 && person.id !== selectedId) {
    const owner = people[sameIdIndex];
    setStatus(`ID ${person.id} は「${owner.name || `#${owner.id}`}」が使用中です。別のIDを指定してください。`, { tone: "error" });
    return;
  }

  if (sameIdIndex >= 0) {
    people[sameIdIndex] = person;
  } else {
    people.push(person);
  }

  clearPreviousSpouseLinks(previousPerson, person);
  syncSpouseLinks(person);
  people = normalizePeople(people);
  selectedId = person.id;
  persistAndRender("保存しました。");
}

function clearPreviousSpouseLinks(previousPerson, currentPerson) {
  if (!previousPerson) return;
  const currentSpouseIds = new Set(currentPerson.spouseIds);
  for (const previousSpouseId of previousPerson.spouseIds) {
    if (currentSpouseIds.has(previousSpouseId)) continue;
    const previousSpouse = people.find((item) => item.id === previousSpouseId);
    if (!previousSpouse) continue;
    previousSpouse.spouseIds = previousSpouse.spouseIds.filter((spouseId) => spouseId !== currentPerson.id);
    previousSpouse.spouseId = previousSpouse.spouseIds[0] ?? null;
    delete previousSpouse.spouseRelationshipTypes[String(currentPerson.id)];
  }
}

function syncSpouseLinks(person) {
  for (const spouseId of person.spouseIds) {
    const spouse = people.find((item) => item.id === spouseId);
    if (!spouse) continue;
    if (!spouse.spouseIds.includes(person.id)) spouse.spouseIds.push(person.id);
    spouse.spouseId = spouse.spouseIds[0] ?? null;
    spouse.spouseRelationshipTypes[String(person.id)] = person.spouseRelationshipTypes[String(spouseId)] || person.relationshipType || "married";
  }
}

async function deleteSelected() {
  const target = people.find((item) => item.id === selectedId);
  if (!target) {
    setStatus("削除する人物が選ばれていません。人物一覧から選んでください。");
    return;
  }
  const targetName = target.name || `#${target.id}`;
  const confirmed = await confirmAction({
    title: "人物を削除",
    body: `「${targetName}」を削除します。この人物を親・配偶者として参照している関係も外れます。`,
    okLabel: "削除"
  });
  if (!confirmed) return;
  const previous = snapshot();
  const id = target.id;
  people = people
    .filter((person) => person.id !== id)
    .map((person) => ({
      ...person,
      spouseIds: person.spouseIds.filter((spouseId) => spouseId !== id),
      spouseId: person.spouseIds.filter((spouseId) => spouseId !== id)[0] ?? null,
      spouseRelationshipTypes: Object.fromEntries(Object.entries(person.spouseRelationshipTypes).filter(([spouseId]) => Number(spouseId) !== id)),
      parentIds: person.parentIds.filter((parentId) => parentId !== id),
      parentRelationshipTypes: Object.fromEntries(Object.entries(person.parentRelationshipTypes).filter(([parentId]) => Number(parentId) !== id))
    }));
  selectedId = people[0]?.id ?? null;
  persistAndRender(`「${targetName}」を削除しました。`, { undo: previous });
}

function persistAndRender(message, options = {}) {
  const saved = savePeople();
  renderAll();
  if (saved) {
    setStatus(message, options);
    return;
  }
  setStatus("ブラウザに保存できませんでした。JSON書き出しでバックアップしてください。", { tone: "error", persistent: true });
}

function renderAll() {
  selectPerson(selectedId);
  renderPeopleList();
  renderBackups();
  jsonEditor.value = JSON.stringify(people, null, 2);
  summary.textContent = `${people.length}人`;
  const generations = [...new Set(people.map((person) => person.generation))].sort((a, b) => a - b);
  const spec = getPaperSpec();
  layoutSummary.textContent = generations.length ? `${generations[0]}〜${generations.at(-1)}世代 / ${spec.label}横` : `${spec.label}横`;
  applyPaperSize();
  renderPreview();
}

function renderPeopleList() {
  peopleList.innerHTML = "";
  for (const person of people) {
    const row = document.createElement("div");
    row.className = "person-row";
    row.classList.toggle("is-selected", person.id === selectedId);
    const avatar = document.createElement("div");
    avatar.className = "person-avatar";
    avatar.textContent = String(person.id);
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "person-title";
    title.textContent = person.name || `#${person.id}`;
    const meta = document.createElement("div");
    meta.className = "person-meta";
    meta.textContent = `${person.relation ? `続柄:${person.relation} / ` : ""}世代:${person.generation} / 配偶者:${person.spouseIds.join(",") || "-"} / 親:${person.parentIds.join(",") || "-"}`;
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.append(createIcon("ic-edit"), "編集");
    edit.setAttribute("aria-label", `${person.name || person.id}を編集`);
    edit.addEventListener("click", () => {
      selectedId = person.id;
      selectPerson(person.id);
      renderPeopleList();
    });
    text.append(title, meta);
    row.append(avatar, text, edit);
    peopleList.append(row);
  }
}

function createIcon(symbolId) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${symbolId}`);
  svg.append(use);
  return svg;
}

function attachRipples() {
  document.addEventListener("pointerdown", (event) => {
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
  });
}

function treeColors() {
  const styles = getComputedStyle(document.documentElement);
  return {
    marriage: styles.getPropertyValue("--marriage").trim(),
    child: styles.getPropertyValue("--child").trim()
  };
}

function renderPreview() {
  const rect = canvas.parentElement.getBoundingClientRect();
  const width = Math.max(900, Math.round(rect.width * window.devicePixelRatio));
  const height = Math.round(width / getPaperSpec().ratio);
  canvas.width = width;
  canvas.height = height;
  lastLayout = drawFamilyTree(canvas, people, treeColors());
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function hitTestPerson(point) {
  if (!lastLayout) return null;
  for (let index = lastLayout.people.length - 1; index >= 0; index -= 1) {
    const person = lastLayout.people[index];
    const pos = lastLayout.positions.get(person.id);
    if (!pos) continue;
    if (Math.abs(point.x - pos.x) <= lastLayout.box.w / 2 && Math.abs(point.y - pos.y) <= lastLayout.box.h / 2) {
      return { person, pos };
    }
  }
  return null;
}

function toggleManualLayout() {
  manualLayoutMode = !manualLayoutMode;
  paper.classList.toggle("is-manual", manualLayoutMode);
  const button = document.getElementById("manualLayoutBtn");
  const buttonLabel = button.querySelector(".btn-label") || button;
  buttonLabel.textContent = manualLayoutMode ? "配置調整を終了" : "配置調整";
  button.setAttribute("aria-pressed", String(manualLayoutMode));
  setStatus(manualLayoutMode ? "人物枠をドラッグして配置を調整できます。" : "配置調整を終了しました。");
}

function resetManualLayout() {
  const previous = snapshot();
  people = people.map((person) => ({ ...person, position: null }));
  persistAndRender("自動配置に戻しました。", { undo: previous });
}

function handlePointerDown(event) {
  if (!manualLayoutMode) return;
  const hit = hitTestPerson(canvasPoint(event));
  if (!hit) return;
  draggedPersonId = hit.person.id;
  const point = canvasPoint(event);
  dragOffset = { x: point.x - hit.pos.x, y: point.y - hit.pos.y };
  canvas.setPointerCapture(event.pointerId);
  event.preventDefault();
}

function handlePointerMove(event) {
  if (draggedPersonId === null || !manualLayoutMode) return;
  const person = people.find((item) => item.id === draggedPersonId);
  if (!person) return;
  const point = canvasPoint(event);
  const x = clamp(point.x - dragOffset.x, lastLayout.box.w / 2 + 12, canvas.width - lastLayout.box.w / 2 - 12);
  const y = clamp(point.y - dragOffset.y, lastLayout.box.h / 2 + 12, canvas.height - lastLayout.box.h / 2 - 12);
  person.position = { x: x / canvas.width, y: y / canvas.height };
  renderPreview();
  event.preventDefault();
}

function finishPointerDrag(event) {
  if (draggedPersonId === null) return;
  if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  draggedPersonId = null;
  savePeople();
  renderAll();
  setStatus("配置を保存しました。");
}

function applyJson() {
  const previous = snapshot();
  try {
    const parsed = JSON.parse(jsonEditor.value);
    applyPeopleData(parsed, "JSONを反映しました。", { undo: previous });
  } catch (error) {
    setStatus(`JSONエラー: ${error.message}`, { tone: "error" });
  }
}

function applyPeopleData(parsed, message, options = {}) {
  if (!Array.isArray(parsed)) throw new Error("人物データは配列形式で指定してください。");
  people = normalizePeople(parsed);
  selectedId = people[0]?.id ?? null;
  persistAndRender(message, options);
}

function exportJson() {
  const blob = new Blob([JSON.stringify(people, null, 2)], { type: "application/json" });
  if (lastJsonUrl) URL.revokeObjectURL(lastJsonUrl);
  lastJsonUrl = URL.createObjectURL(blob);
  jsonDownloadLink.href = lastJsonUrl;
  jsonDownloadLink.download = `familytree-${new Date().toISOString().slice(0, 10)}.json`;
  jsonDownloadBox.classList.add("is-visible");
  setStatus("JSONを書き出しました。表示されたリンクをクリックして保存してください。");
}

async function importJsonFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const previous = snapshot();
  try {
    const parsed = JSON.parse(await file.text());
    applyPeopleData(parsed, "JSONを読み込みました。", { undo: previous });
  } catch (error) {
    setStatus(`JSON読込エラー: ${error.message}`, { tone: "error" });
  } finally {
    event.target.value = "";
  }
}

form.addEventListener("submit", upsertPerson);
document.getElementById("newBtn").addEventListener("click", () => {
  selectedId = null;
  selectPerson(null);
});
document.getElementById("deleteBtn").addEventListener("click", deleteSelected);
document.getElementById("applyJsonBtn").addEventListener("click", applyJson);
document.getElementById("suggestRelationBtn").addEventListener("click", suggestRelation);
document.getElementById("exportJsonBtn").addEventListener("click", exportJson);
document.getElementById("importJsonBtn").addEventListener("click", () => jsonFileInput.click());
jsonFileInput.addEventListener("change", importJsonFile);
document.getElementById("manualLayoutBtn").addEventListener("click", toggleManualLayout);
document.getElementById("resetLayoutBtn").addEventListener("click", resetManualLayout);
canvas.addEventListener("pointerdown", handlePointerDown);
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", finishPointerDrag);
canvas.addEventListener("pointercancel", finishPointerDrag);
document.getElementById("sampleBtn").addEventListener("click", async () => {
  const confirmed = await confirmAction({
    title: "サンプルデータを復元",
    body: "現在の人物データをすべてサンプルに置き換えます。「元に戻す」で取り消せます。",
    okLabel: "置き換える"
  });
  if (!confirmed) return;
  const previous = snapshot();
  people = normalizePeople(structuredClone(samplePeople));
  selectedId = people[0].id;
  persistAndRender("サンプルデータを復元しました。", { undo: previous });
});
document.getElementById("fitBtn").addEventListener("click", renderPreview);
paperSizeSelect.addEventListener("change", () => {
  paperSize = PAPER_SIZES[paperSizeSelect.value] ? paperSizeSelect.value : DEFAULT_PAPER_SIZE;
  savePaperSize();
  renderAll();
  setStatus(`${getPaperSpec().label}横に変更しました。`);
});
document.getElementById("printBtn").addEventListener("click", () => window.print());
undoBtn.addEventListener("click", () => {
  if (!pendingUndo) return;
  const saved = pendingUndo;
  pendingUndo = null;
  restoreSnapshot(saved);
});
window.addEventListener("resize", renderPreview);

attachRipples();
renderAll();
if (!checkStorage()) {
  setStatus("このブラウザではデータを保存できません（プライベートモードなどの可能性があります）。JSON書き出しでバックアップしてください。", { tone: "error", persistent: true });
}
