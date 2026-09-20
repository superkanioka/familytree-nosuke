// アプリの状態とロジックの中枢。DOM・Canvas には触れず、
// localStorage と純粋モジュール（data/layout/draw）だけを扱う。
// 旧 app.js のふるまいを Svelte 5 のルーンへ移した。
import {
  DEFAULT_PAPER_SIZE,
  MAX_PHOTO_LENGTH,
  PAPER_SIZES,
  applyPersonEdit,
  createDraft,
  normalizePeople,
  samplePeople,
  suggestRelationFor,
  suggestedGeneration,
  validateDraft
} from "../data.js";

const PEOPLE_KEY = "familytree.people";
const PAPER_KEY = "familytree.paperSize";
const BACKUP_KEY = "familytree.backups";
const BACKUP_LIMIT = 5;
const HISTORY_LIMIT = 50;

function loadPeople() {
  try {
    const saved = localStorage.getItem(PEOPLE_KEY);
    return saved ? normalizePeople(JSON.parse(saved)) : normalizePeople(structuredClone(samplePeople));
  } catch {
    return normalizePeople(structuredClone(samplePeople));
  }
}

function loadPaperSize() {
  try {
    const saved = localStorage.getItem(PAPER_KEY);
    return PAPER_SIZES[saved] ? saved : DEFAULT_PAPER_SIZE;
  } catch {
    return DEFAULT_PAPER_SIZE;
  }
}

function loadBackups() {
  try {
    const saved = JSON.parse(localStorage.getItem(BACKUP_KEY) ?? "[]");
    return Array.isArray(saved) ? saved.filter((item) => typeof item?.json === "string") : [];
  } catch {
    return [];
  }
}

class Store {
  people = $state(loadPeople());
  paperSize = $state(loadPaperSize());
  selectedId = $state(null);
  draft = $state(createDraft(null));
  manualLayoutMode = $state(false);
  // 破壊操作の直前に past へ積む。ボタンの有効・無効に使うため長さを反映させる。
  history = $state({ past: [], future: [] });
  // スナックバー
  snackbar = $state({ message: "", tone: "default", canUndo: false, visible: false });
  // 写真は id→Image。描画は同期なので先読みして、読み込むたびに version を上げて再描画させる。
  photoImages = new Map();
  photoVersion = $state(0);
  backups = $state([]);
  installPrompt = $state(null);
  storageOk = $state(true);
  // JSON テキストエリアの内容
  jsonText = $state("");

  #statusTimer = 0;
  #deceasedTouched = false;

  constructor() {
    this.selectedId = this.people[0]?.id ?? null;
    this.draft = createDraft(this.people.find((p) => p.id === this.selectedId) ?? null);
    this.storageOk = this.#checkStorage();
    this.#refreshDerived();
  }

  get paperSpec() {
    return PAPER_SIZES[this.paperSize] || PAPER_SIZES[DEFAULT_PAPER_SIZE];
  }

  #checkStorage() {
    try {
      localStorage.setItem("familytree.probe", "1");
      localStorage.removeItem("familytree.probe");
      return true;
    } catch {
      return false;
    }
  }

  #refreshDerived() {
    this.jsonText = JSON.stringify(this.people, null, 2);
    this.backups = this.#backupsForDisplay();
    this.syncPhotoImages();
  }

  savePeople() {
    try {
      localStorage.setItem(PEOPLE_KEY, JSON.stringify(this.people, null, 2));
    } catch (error) {
      console.warn("familytree: 保存できませんでした", error);
      return false;
    }
    this.#pushBackup();
    return true;
  }

  savePaperSize() {
    try {
      localStorage.setItem(PAPER_KEY, this.paperSize);
    } catch (error) {
      console.warn("familytree: 用紙サイズを保存できませんでした", error);
    }
  }

  #pushBackup() {
    try {
      const json = JSON.stringify(this.people);
      const backups = loadBackups();
      if (backups[0]?.json === json) return;
      backups.unshift({ savedAt: new Date().toISOString(), count: this.people.length, json });
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backups.slice(0, BACKUP_LIMIT)));
    } catch (error) {
      console.warn("familytree: バックアップを保存できませんでした", error);
    }
  }

  #backupsForDisplay() {
    const current = JSON.stringify(this.people);
    return loadBackups().filter((backup) => backup.json !== current);
  }

  // ---- 履歴 ----
  #snapshot() {
    return { people: structuredClone($state.snapshot(this.people)), selectedId: this.selectedId };
  }

  pushHistory() {
    this.history.past.push(this.#snapshot());
    if (this.history.past.length > HISTORY_LIMIT) this.history.past.shift();
    this.history.future.length = 0;
  }

  undo() {
    const previous = this.history.past.pop();
    if (!previous) return false;
    this.history.future.push(this.#snapshot());
    this.#applySnapshot(previous, "元に戻しました。");
    return true;
  }

  redo() {
    const next = this.history.future.pop();
    if (!next) return false;
    this.history.past.push(this.#snapshot());
    this.#applySnapshot(next, "やり直しました。");
    return true;
  }

  #applySnapshot(saved, message) {
    this.people = normalizePeople(saved.people);
    this.selectedId = saved.selectedId ?? this.people[0]?.id ?? null;
    this.savePeople();
    this.#refreshDerived();
    this.selectPerson(this.selectedId);
    this.setStatus(message);
  }

  // ---- 選択・下書き ----
  selectPerson(id) {
    this.selectedId = id;
    const person = this.people.find((item) => item.id === id) ?? null;
    this.draft = createDraft(person);
    this.#deceasedTouched = false;
  }

  newPerson() {
    this.selectedId = null;
    this.selectPerson(null);
  }

  // 生没年に終年を入れたら故人扱い（利用者が自分でチェックを触った後は上書きしない）
  onYearsInput(value) {
    this.draft.years = value;
    if (this.#deceasedTouched) return;
    this.draft.deceased = /\d{3,4}\s*[-–—~〜]\s*\d{3,4}/.test(String(value ?? ""));
  }

  markDeceasedTouched() {
    this.#deceasedTouched = true;
  }

  suggestRelation() {
    const suggestion = suggestRelationFor({
      people: this.people,
      currentId: this.draft.id,
      parentIds: this.draft.parents.map((entry) => entry.id),
      hasSpouse: this.draft.spouses.length > 0,
      generation: Number(this.draft.generation)
    });
    this.draft.relation = suggestion.relation;
    this.setStatus(suggestion.message);
  }

  addParent(id) {
    if (this.draft.parents.length >= 2) {
      this.setStatus("親は2人までです。入れ替えるには、いま登録されている親を外してください。");
      return;
    }
    this.draft.parents.push({ id, type: "biological" });
    const generation = suggestedGeneration(this.people, this.draft.parents.map((entry) => entry.id));
    if (generation !== null) this.draft.generation = generation;
    this.setStatus(generation === null ? "親を追加しました。" : `親を追加し、世代を${generation}にしました。`);
  }

  addSpouse(id) {
    this.draft.spouses.push({ id, type: "married" });
    this.setStatus("配偶者を追加しました。");
  }

  removeParent(index) {
    this.draft.parents.splice(index, 1);
  }

  removeSpouse(index) {
    this.draft.spouses.splice(index, 1);
  }

  // 親・配偶者ピッカーで除外すべき id
  parentExcludeIds() {
    return [this.draft.id, ...this.draft.parents.map((e) => e.id), ...this.draft.spouses.map((e) => e.id)]
      .filter((id) => id !== null);
  }

  spouseExcludeIds() {
    return [this.draft.id, ...this.draft.spouses.map((e) => e.id), ...this.draft.parents.map((e) => e.id)]
      .filter((id) => id !== null);
  }

  save() {
    const errors = validateDraft(this.draft);
    if (Object.keys(errors).length) {
      this.setStatus("入力内容を確認してください。", { tone: "error" });
      return errors;
    }
    const isNew = this.draft.id === null;
    const name = String(this.draft.name).trim();
    this.pushHistory();
    const plainDraft = $state.snapshot(this.draft);
    const result = applyPersonEdit(this.people, plainDraft);
    this.people = result.people;
    this.selectedId = result.id;
    this.#persistAndRender(isNew ? `「${name}」を追加しました。` : "保存しました。", { undo: true });
    return {};
  }

  deleteSelected() {
    const target = this.people.find((item) => item.id === this.selectedId);
    if (!target) {
      this.setStatus("削除する人物が選ばれていません。人物一覧から選んでください。");
      return;
    }
    const targetName = target.name || `#${target.id}`;
    const id = target.id;
    this.pushHistory();
    this.people = this.people
      .filter((person) => person.id !== id)
      .map((person) => ({
        ...person,
        spouseIds: person.spouseIds.filter((spouseId) => spouseId !== id),
        spouseId: person.spouseIds.filter((spouseId) => spouseId !== id)[0] ?? null,
        spouseRelationshipTypes: Object.fromEntries(Object.entries(person.spouseRelationshipTypes).filter(([spouseId]) => Number(spouseId) !== id)),
        parentIds: person.parentIds.filter((parentId) => parentId !== id),
        parentRelationshipTypes: Object.fromEntries(Object.entries(person.parentRelationshipTypes).filter(([parentId]) => Number(parentId) !== id))
      }));
    this.selectedId = this.people[0]?.id ?? null;
    this.#persistAndRender(`「${targetName}」を削除しました。`, { undo: true });
  }

  #persistAndRender(message, options = {}) {
    const saved = this.savePeople();
    this.#refreshDerived();
    this.selectPerson(this.selectedId);
    if (saved) {
      this.setStatus(message, options);
      return;
    }
    this.setStatus("ブラウザに保存できませんでした。JSON書き出しでバックアップしてください。", { tone: "error", persistent: true });
  }

  // ---- 用紙 ----
  setPaperSize(value) {
    this.paperSize = PAPER_SIZES[value] ? value : DEFAULT_PAPER_SIZE;
    this.savePaperSize();
    this.setStatus(`${this.paperSpec.label}に変更しました。`);
  }

  // ---- 配置調整 ----
  toggleManualLayout() {
    this.manualLayoutMode = !this.manualLayoutMode;
    this.setStatus(this.manualLayoutMode ? "人物枠をドラッグして配置を調整できます。" : "配置調整を終了しました。");
  }

  resetManualLayout() {
    this.pushHistory();
    this.people = this.people.map((person) => ({ ...person, position: null }));
    this.#persistAndRender("自動配置に戻しました。", { undo: true });
  }

  setPersonPosition(id, x, y) {
    const person = this.people.find((item) => item.id === id);
    if (person) person.position = { x, y };
  }

  commitPositions() {
    this.savePeople();
    this.#refreshDerived();
    this.setStatus("配置を保存しました。");
  }

  // ---- 写真 ----
  async choosePhoto(file) {
    try {
      const photo = await this.#readPhoto(file);
      if (photo.length > MAX_PHOTO_LENGTH) {
        this.setStatus("写真を小さくできませんでした。別の画像を選んでください。", { tone: "error" });
        return;
      }
      this.draft.photo = photo;
      this.setStatus("写真を読み込みました。保存すると家系図に載ります。");
    } catch (error) {
      this.setStatus(`写真を読み込めませんでした: ${error.message}`, { tone: "error" });
    }
  }

  removePhoto() {
    this.draft.photo = null;
    this.setStatus("写真を外しました。保存すると反映されます。");
  }

  async #readPhoto(file) {
    const bitmap = await createImageBitmap(file);
    const limit = 160;
    const scale = Math.min(limit / bitmap.width, limit / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.75);
  }

  // 描画は同期なので、写真は先に読み込んでから version を上げて再描画させる。
  syncPhotoImages() {
    const wanted = new Set();
    for (const person of this.people) {
      if (!person.photo) continue;
      wanted.add(person.id);
      const cached = this.photoImages.get(person.id);
      if (cached && cached.dataset.photo === person.photo) continue;
      const image = new Image();
      image.dataset.photo = person.photo;
      image.addEventListener("load", () => {
        this.photoImages.set(person.id, image);
        this.photoVersion += 1;
      }, { once: true });
      image.addEventListener("error", () => this.photoImages.delete(person.id), { once: true });
      image.src = person.photo;
    }
    for (const id of [...this.photoImages.keys()]) {
      if (!wanted.has(id)) this.photoImages.delete(id);
    }
  }

  // ---- JSON ----
  applyJsonText() {
    try {
      const parsed = JSON.parse(this.jsonText);
      this.pushHistory();
      this.#applyPeopleData(parsed, "JSONを反映しました。", { undo: true });
    } catch (error) {
      this.setStatus(`JSONエラー: ${error.message}`, { tone: "error" });
    }
  }

  async importJsonFile(file) {
    try {
      const parsed = JSON.parse(await file.text());
      this.pushHistory();
      this.#applyPeopleData(parsed, "JSONを読み込みました。", { undo: true });
    } catch (error) {
      this.setStatus(`JSON読込エラー: ${error.message}`, { tone: "error" });
    }
  }

  #applyPeopleData(parsed, message, options = {}) {
    if (!Array.isArray(parsed)) throw new Error("人物データは配列形式で指定してください。");
    this.people = normalizePeople(parsed);
    this.selectedId = this.people[0]?.id ?? null;
    this.#persistAndRender(message, options);
  }

  restoreSample() {
    this.pushHistory();
    this.people = normalizePeople(structuredClone(samplePeople));
    this.selectedId = this.people[0].id;
    this.#persistAndRender("サンプルデータを復元しました。", { undo: true });
  }

  restoreBackup(backup) {
    try {
      this.pushHistory();
      this.#applyPeopleData(JSON.parse(backup.json), "バックアップから復元しました。", { undo: true });
    } catch (error) {
      this.setStatus(`バックアップを読み込めませんでした: ${error.message}`, { tone: "error" });
    }
  }

  exportJsonBlobUrl() {
    const blob = new Blob([JSON.stringify(this.people, null, 2)], { type: "application/json" });
    return URL.createObjectURL(blob);
  }

  // ---- スナックバー ----
  setStatus(message, options = {}) {
    const { tone = "default", persistent = false, undo: canUndo = false } = options;
    this.snackbar = { message, tone, canUndo: canUndo && this.history.past.length > 0, visible: Boolean(message) };
    clearTimeout(this.#statusTimer);
    if (!message || persistent) return;
    this.#statusTimer = setTimeout(() => this.hideStatus(), canUndo ? 10000 : 4000);
  }

  hideStatus() {
    this.snackbar = { message: "", tone: "default", canUndo: false, visible: false };
  }

  // ---- PWA インストール ----
  setInstallPrompt(event) {
    this.installPrompt = event;
  }

  async runInstall() {
    if (!this.installPrompt) return;
    const prompt = this.installPrompt;
    this.installPrompt = null;
    await prompt.prompt();
  }
}

export const store = new Store();
