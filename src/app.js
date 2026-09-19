// 画面の組み立てとイベント配線。DOM・localStorage・印刷まわりはここだけに置く。
import {
  DEFAULT_PAPER_SIZE,
  PARENT_RELATIONSHIP_LABELS,
  PAPER_SIZES,
  SPOUSE_RELATIONSHIP_LABELS,
  applyPersonEdit,
  createDraft,
  describeRelations,
  normalizePeople,
  samplePeople,
  suggestRelationFor,
  suggestedGeneration,
  validateDraft
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
  name: document.getElementById("name"),
  relation: document.getElementById("relation"),
  years: document.getElementById("years"),
  generation: document.getElementById("generation")
};
const fieldErrors = {
  name: document.getElementById("nameError"),
  generation: document.getElementById("generationError")
};
const parentList = document.getElementById("parentList");
const spouseList = document.getElementById("spouseList");
const pickerDialog = document.getElementById("pickerDialog");
const pickerSearch = document.getElementById("pickerSearch");
const pickerList = document.getElementById("pickerList");
const pickerEmpty = document.getElementById("pickerEmpty");
const pickerTitle = document.getElementById("pickerTitle");
const pickerCancelBtn = document.getElementById("pickerCancelBtn");
const undoActionBtn = document.getElementById("undoActionBtn");
const sidebar = document.getElementById("editorSidebar");
const sheetToggle = document.getElementById("sheetToggle");
const installBtn = document.getElementById("installBtn");
const smallScreen = window.matchMedia("(max-width: 920px)");
const redoActionBtn = document.getElementById("redoActionBtn");

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
let installPrompt = null;

// 編集中の下書き。IDは新規なら null で、保存時に採番する。
let draft = createDraft(null);
// 取り消し履歴。past の末尾が「ひとつ前の状態」。
const history = { past: [], future: [] };
const HISTORY_LIMIT = 50;

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
  try {
    pushHistory();
    applyPeopleData(JSON.parse(backup.json), "バックアップから復元しました。", { undo: true });
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

// 破壊的な操作の直前に呼ぶ。past に積み、やり直し履歴は捨てる。
function pushHistory() {
  history.past.push(snapshot());
  if (history.past.length > HISTORY_LIMIT) history.past.shift();
  history.future.length = 0;
}

function undo() {
  const previous = history.past.pop();
  if (!previous) return false;
  history.future.push(snapshot());
  applySnapshot(previous, "元に戻しました。");
  return true;
}

function redo() {
  const next = history.future.pop();
  if (!next) return false;
  history.past.push(snapshot());
  applySnapshot(next, "やり直しました。");
  return true;
}

function applySnapshot(saved, message) {
  people = normalizePeople(saved.people);
  selectedId = saved.selectedId ?? people[0]?.id ?? null;
  savePeople();
  renderAll();
  setStatus(message);
}

function updateHistoryButtons() {
  undoActionBtn.disabled = history.past.length === 0;
  redoActionBtn.disabled = history.future.length === 0;
}


// 名前で人物を選ぶダイアログ。選ばれたIDを返し、閉じられたら null を返す。
function openPersonPicker({ title, excludeIds }) {
  const candidates = people.filter((person) => !excludeIds.includes(person.id));
  if (!candidates.length) {
    setStatus("選べる人物がいません。先に人物を追加してください。");
    return Promise.resolve(null);
  }
  if (typeof pickerDialog.showModal !== "function" || pickerDialog.open) return Promise.resolve(null);

  pickerTitle.textContent = title;
  pickerSearch.value = "";
  pickerEmpty.hidden = true;

  return new Promise((resolve) => {
    const finish = (id) => {
      pickerSearch.removeEventListener("input", renderCandidates);
      pickerCancelBtn.removeEventListener("click", cancel);
      pickerDialog.removeEventListener("cancel", cancel);
      pickerDialog.removeEventListener("close", cancel);
      if (pickerDialog.open) pickerDialog.close();
      resolve(id);
    };
    const cancel = () => finish(null);

    function renderCandidates() {
      const keyword = pickerSearch.value.trim().toLowerCase();
      const shown = keyword
        ? candidates.filter((person) => `${person.name}${person.relation}${person.years}`.toLowerCase().includes(keyword))
        : candidates;
      pickerList.innerHTML = "";
      pickerEmpty.hidden = shown.length > 0;
      for (const person of shown) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "picker-row";
        const avatar = document.createElement("span");
        avatar.className = "person-avatar";
        avatar.textContent = [...(person.name || "?")][0];
        const text = document.createElement("span");
        const name = document.createElement("span");
        name.className = "picker-name";
        name.textContent = person.name;
        const meta = document.createElement("span");
        meta.className = "picker-meta";
        meta.textContent = describeRelations(person, people);
        text.append(name, meta);
        row.append(avatar, text);
        row.addEventListener("click", () => finish(person.id));
        pickerList.append(row);
      }
    }

    pickerSearch.addEventListener("input", renderCandidates);
    pickerCancelBtn.addEventListener("click", cancel);
    pickerDialog.addEventListener("cancel", cancel);
    pickerDialog.addEventListener("close", cancel);
    renderCandidates();
    pickerDialog.showModal();
    pickerSearch.focus();
  });
}

async function addParent() {
  readDraftFields();
  if (draft.parents.length >= 2) {
    setStatus("親は2人までです。入れ替えるには、いま登録されている親を外してください。");
    return;
  }
  const excludeIds = [draft.id, ...draft.parents.map((entry) => entry.id), ...draft.spouses.map((entry) => entry.id)]
    .filter((id) => id !== null);
  const id = await openPersonPicker({ title: "親を選ぶ", excludeIds });
  if (id === null) return;
  draft.parents.push({ id, type: "biological" });
  const generation = suggestedGeneration(people, draft.parents.map((entry) => entry.id));
  if (generation !== null) draft.generation = generation;
  renderDraft();
  setStatus(generation === null ? "親を追加しました。" : `親を追加し、世代を${generation}にしました。`);
}

async function addSpouse() {
  readDraftFields();
  const excludeIds = [draft.id, ...draft.spouses.map((entry) => entry.id), ...draft.parents.map((entry) => entry.id)]
    .filter((id) => id !== null);
  const id = await openPersonPicker({ title: "配偶者を選ぶ", excludeIds });
  if (id === null) return;
  draft.spouses.push({ id, type: "married" });
  renderDraft();
  setStatus("配偶者を追加しました。");
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
  const { tone = "default", persistent = false, undo: canUndo = false } = options;
  status.textContent = message;
  snackbar.hidden = !message;
  snackbar.classList.toggle("is-error", tone === "error");
  undoBtn.hidden = !canUndo || history.past.length === 0;
  window.clearTimeout(setStatus.timer);
  if (!message || persistent) return;
  setStatus.timer = window.setTimeout(hideStatus, canUndo ? 10000 : 4000);
}

function hideStatus() {
  status.textContent = "";
  snackbar.hidden = true;
  snackbar.classList.remove("is-error");
  undoBtn.hidden = true;
}

function selectPerson(id) {
  selectedId = id;
  const person = people.find((item) => item.id === id) ?? null;
  draft = createDraft(person);
  renderDraft();
}

// 下書きを入力欄と関係リストへ流し込む。
function renderDraft() {
  fields.name.value = draft.name;
  fields.relation.value = draft.relation;
  fields.years.value = draft.years;
  fields.generation.value = draft.generation;
  clearFieldErrors();
  renderRelationList(parentList, draft.parents, PARENT_RELATIONSHIP_LABELS, "親");
  renderRelationList(spouseList, draft.spouses, SPOUSE_RELATIONSHIP_LABELS, "配偶者");
}

// 入力欄の内容を下書きへ取り込む（関係は下書き側が常に正）。
function readDraftFields() {
  draft.name = fields.name.value;
  draft.relation = fields.relation.value;
  draft.years = fields.years.value;
  draft.generation = fields.generation.value;
}

function renderRelationList(container, entries, labels, kind) {
  container.innerHTML = "";
  for (const entry of entries) {
    const person = people.find((item) => item.id === entry.id);
    const row = document.createElement("div");
    row.className = "relation-row";

    const name = document.createElement("span");
    name.className = "relation-name";
    name.textContent = person?.name || `#${entry.id}`;

    const select = document.createElement("select");
    select.setAttribute("aria-label", `${name.textContent}との関係`);
    for (const [value, label] of Object.entries(labels)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = labels[entry.type] ? entry.type : Object.keys(labels)[0];
    select.addEventListener("change", () => {
      entry.type = select.value;
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.title = `${kind}から外す`;
    remove.setAttribute("aria-label", `${name.textContent}を${kind}から外す`);
    remove.append(createIcon("ic-close"));
    remove.addEventListener("click", () => {
      const index = entries.indexOf(entry);
      if (index >= 0) entries.splice(index, 1);
      renderDraft();
    });

    row.append(name, select, remove);
    container.append(row);
  }
}

function clearFieldErrors() {
  for (const [key, element] of Object.entries(fieldErrors)) {
    element.hidden = true;
    element.textContent = "";
    fields[key].classList.remove("is-invalid");
    fields[key].removeAttribute("aria-invalid");
  }
}

function showFieldErrors(errors) {
  clearFieldErrors();
  for (const [key, message] of Object.entries(errors)) {
    const element = fieldErrors[key];
    if (!element) continue;
    element.textContent = message;
    element.hidden = false;
    fields[key].classList.add("is-invalid");
    fields[key].setAttribute("aria-invalid", "true");
  }
  const first = Object.keys(errors)[0];
  if (first && fields[first]) fields[first].focus();
}

function suggestRelation() {
  readDraftFields();
  const suggestion = suggestRelationFor({
    people,
    currentId: draft.id,
    parentIds: draft.parents.map((entry) => entry.id),
    hasSpouse: draft.spouses.length > 0,
    generation: Number(draft.generation)
  });
  draft.relation = suggestion.relation;
  fields.relation.value = suggestion.relation;
  setStatus(suggestion.message);
}

function upsertPerson(event) {
  event.preventDefault();
  readDraftFields();
  const errors = validateDraft(draft);
  if (Object.keys(errors).length) {
    showFieldErrors(errors);
    setStatus("入力内容を確認してください。", { tone: "error" });
    return;
  }
  clearFieldErrors();

  const isNew = draft.id === null;
  pushHistory();
  const result = applyPersonEdit(people, draft);
  people = result.people;
  selectedId = result.id;
  persistAndRender(isNew ? `「${draft.name.trim()}」を追加しました。` : "保存しました。", { undo: true });
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
  pushHistory();
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
  persistAndRender(`「${targetName}」を削除しました。`, { undo: true });
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
  updateHistoryButtons();
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
    avatar.textContent = [...(person.name || "?")][0];
    const text = document.createElement("div");
    const title = document.createElement("div");
    title.className = "person-title";
    title.textContent = person.name || `#${person.id}`;
    const meta = document.createElement("div");
    meta.className = "person-meta";
    meta.textContent = describeRelations(person, people);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "secondary";
    edit.append(createIcon("ic-edit"), "編集");
    edit.setAttribute("aria-label", `${person.name || person.id}を編集`);
    edit.addEventListener("click", () => {
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
  pushHistory();
  people = people.map((person) => ({ ...person, position: null }));
  persistAndRender("自動配置に戻しました。", { undo: true });
}

function handlePointerDown(event) {
  const hit = hitTestPerson(canvasPoint(event));
  if (!hit) return;
  if (hit.person.id !== selectedId) {
    selectPerson(hit.person.id);
    renderPeopleList();
    if (isSheetCollapsed()) setSheetOpen(true);
  }
  if (!manualLayoutMode) return;
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
  try {
    const parsed = JSON.parse(jsonEditor.value);
    pushHistory();
    applyPeopleData(parsed, "JSONを反映しました。", { undo: true });
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

// 印刷と同じ用紙比率で、画面表示より高い解像度の画像を作る（約150dpi）。
const PNG_PIXELS_PER_MM = 6;

function exportPng() {
  const spec = getPaperSpec();
  const target = document.createElement("canvas");
  target.width = Math.round(spec.widthMm * PNG_PIXELS_PER_MM);
  target.height = Math.round(spec.heightMm * PNG_PIXELS_PER_MM);
  drawFamilyTree(target, people, treeColors());
  const fileName = `familytree-${new Date().toISOString().slice(0, 10)}.png`;

  target.toBlob(async (blob) => {
    if (!blob) {
      setStatus("画像を作れませんでした。", { tone: "error" });
      return;
    }
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: "家系図" });
        setStatus("画像を共有しました。");
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
        // 共有できない端末ではダウンロードに切り替える
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    setStatus(`${spec.label}横の画像を保存しました。`);
  }, "image/png");
}

// 小さい画面では、サイドバーをボトムシートとして開閉する。
function setSheetOpen(open) {
  sidebar.classList.toggle("is-open", open);
  sheetToggle.setAttribute("aria-expanded", String(open));
}

function isSheetCollapsed() {
  return smallScreen.matches && !sidebar.classList.contains("is-open");
}

function registerServiceWorker() {
  // file:// で開いたときは登録できないので、何もしない（アプリは従来どおり動く）。
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "http:" && location.protocol !== "https:") return;
  navigator.serviceWorker.register("sw.js").catch((error) => {
    console.warn("familytree: Service Workerを登録できませんでした", error);
  });
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
  try {
    const parsed = JSON.parse(await file.text());
    pushHistory();
    applyPeopleData(parsed, "JSONを読み込みました。", { undo: true });
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
  pushHistory();
  people = normalizePeople(structuredClone(samplePeople));
  selectedId = people[0].id;
  persistAndRender("サンプルデータを復元しました。", { undo: true });
});
document.getElementById("fitBtn").addEventListener("click", renderPreview);
paperSizeSelect.addEventListener("change", () => {
  paperSize = PAPER_SIZES[paperSizeSelect.value] ? paperSizeSelect.value : DEFAULT_PAPER_SIZE;
  savePaperSize();
  renderAll();
  setStatus(`${getPaperSpec().label}横に変更しました。`);
});
document.getElementById("printBtn").addEventListener("click", () => window.print());
document.getElementById("exportPngBtn").addEventListener("click", exportPng);
sheetToggle.addEventListener("click", () => setSheetOpen(!sidebar.classList.contains("is-open")));
smallScreen.addEventListener("change", (event) => setSheetOpen(!event.matches));

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installBtn.hidden = false;
});
installBtn.addEventListener("click", async () => {
  if (!installPrompt) return;
  installBtn.hidden = true;
  const prompt = installPrompt;
  installPrompt = null;
  await prompt.prompt();
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  installBtn.hidden = true;
  setStatus("ホーム画面に追加しました。");
});
undoBtn.addEventListener("click", undo);
undoActionBtn.addEventListener("click", undo);
redoActionBtn.addEventListener("click", redo);
document.getElementById("addParentBtn").addEventListener("click", addParent);
document.getElementById("addSpouseBtn").addEventListener("click", addSpouse);

// 文字入力中は、ブラウザ本来の取り消しを邪魔しない。
document.addEventListener("keydown", (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLElement && target.matches("input, textarea, select")) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    if (!undo()) setStatus("元に戻せる操作がありません。");
  } else if ((key === "z" && event.shiftKey) || key === "y") {
    event.preventDefault();
    if (!redo()) setStatus("やり直せる操作がありません。");
  }
});
window.addEventListener("resize", renderPreview);

attachRipples();
setSheetOpen(!smallScreen.matches);
registerServiceWorker();
renderAll();
if (!checkStorage()) {
  setStatus("このブラウザではデータを保存できません（プライベートモードなどの可能性があります）。JSON書き出しでバックアップしてください。", { tone: "error", persistent: true });
}
