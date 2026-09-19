// 人物データの正規化・入力値の解釈・続柄の推定。
// DOMもCanvasも触らない純粋な処理だけを置く（tests/unit から直接読み込む）。

export const PAPER_SIZES = {
  a3: { key: "a3", label: "A3横", pageSize: "A3", orientation: "landscape", widthMm: 420, heightMm: 297, ratio: 420 / 297 },
  a4: { key: "a4", label: "A4横", pageSize: "A4", orientation: "landscape", widthMm: 297, heightMm: 210, ratio: 297 / 210 },
  b4: { key: "b4", label: "B4横", pageSize: "B4", orientation: "landscape", widthMm: 364, heightMm: 257, ratio: 364 / 257 },
  a3p: { key: "a3p", label: "A3縦", pageSize: "A3", orientation: "portrait", widthMm: 297, heightMm: 420, ratio: 297 / 420 },
  a4p: { key: "a4p", label: "A4縦", pageSize: "A4", orientation: "portrait", widthMm: 210, heightMm: 297, ratio: 210 / 297 }
};

export const GENDER_LABELS = {
  unknown: "未設定",
  male: "男性",
  female: "女性",
  other: "その他"
};

// 写真は縮小してから持つ前提。localStorage を圧迫しないよう上限を決めておく。
export const MAX_PHOTO_LENGTH = 120000;

export const DEFAULT_PAPER_SIZE = "a3";

export const samplePeople = [
  { id: 1, name: "野介 宗一郎", years: "1888-1962", generation: 0, spouseId: 2, parentIds: [], relationshipType: "married" },
  { id: 2, name: "野介 ハナ", years: "1892-1970", generation: 0, spouseId: 1, parentIds: [], relationshipType: "married" },
  { id: 3, name: "野介 清", years: "1915-1988", generation: 1, spouseId: 4, parentIds: [1, 2], relationshipType: "married" },
  { id: 4, name: "野介 文子", years: "1918-1997", generation: 1, spouseId: 3, parentIds: [], relationshipType: "married" },
  { id: 5, name: "野介 勇", years: "1920-2001", generation: 1, spouseId: 6, parentIds: [1, 2], relationshipType: "married" },
  { id: 6, name: "野介 玲子", years: "1925-2010", generation: 1, spouseId: 5, parentIds: [], relationshipType: "married" },
  { id: 7, name: "野介 正", years: "1942-", generation: 2, spouseId: 8, parentIds: [3, 4], relationshipType: "married" },
  { id: 8, name: "野介 恵", years: "1945-", generation: 2, spouseId: 7, parentIds: [], relationshipType: "married" },
  { id: 9, name: "野介 和子", years: "1948-", generation: 2, spouseId: 10, parentIds: [3, 4], relationshipType: "married" },
  { id: 10, name: "田中 進", years: "1946-", generation: 2, spouseId: 9, parentIds: [], relationshipType: "married" },
  { id: 11, name: "野介 隆", years: "1950-", generation: 2, spouseId: 12, parentIds: [5, 6], relationshipType: "married" },
  { id: 12, name: "野介 由美", years: "1952-", generation: 2, spouseId: 11, parentIds: [], relationshipType: "married" },
  { id: 13, name: "野介 健太", years: "1975-", generation: 3, spouseId: 14, parentIds: [7, 8], relationshipType: "married" },
  { id: 14, name: "野介 真理", years: "1978-", generation: 3, spouseId: 13, parentIds: [], relationshipType: "married" },
  { id: 15, name: "田中 彩", years: "1977-", generation: 3, spouseId: 16, parentIds: [9, 10], relationshipType: "married" },
  { id: 16, name: "佐藤 悠", years: "1974-", generation: 3, spouseId: 15, parentIds: [], relationshipType: "married" },
  { id: 17, name: "野介 葵", years: "2004-", generation: 4, spouseId: null, parentIds: [13, 14], relationshipType: "married" },
  { id: 18, name: "野介 蓮", years: "2008-", generation: 4, spouseId: null, parentIds: [13, 14], relationshipType: "married" },
  { id: 19, name: "佐藤 凛", years: "2006-", generation: 4, spouseId: null, parentIds: [15, 16], relationshipType: "married" }
];

const sampleRelationLabels = {
  1: "高祖父", 2: "高祖母", 3: "祖父", 4: "祖母", 5: "大叔父", 6: "大叔母",
  7: "父", 8: "母", 9: "叔母", 10: "叔父", 11: "叔父", 12: "叔母",
  13: "本人", 14: "配偶者", 15: "いとこ", 16: "いとこの配偶者",
  17: "長女", 18: "長男", 19: "子"
};

// サンプルは続柄から性別を当てる（□○の表示を最初から確かめられるように）
const sampleGenders = {
  1: "male", 2: "female", 3: "male", 4: "female", 5: "male", 6: "female",
  7: "male", 8: "female", 9: "female", 10: "male", 11: "male", 12: "female",
  13: "male", 14: "female", 15: "female", 16: "male",
  17: "female", 18: "male", 19: "female"
};

for (const person of samplePeople) {
  person.relation = sampleRelationLabels[person.id] || "";
  person.gender = sampleGenders[person.id] || "unknown";
}

export function normalizePeople(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((person) => {
      const spouseIds = normalizeSpouseIds(person.spouseIds, person.spouseId);
      return {
        id: Number(person.id),
        name: String(person.name ?? "").trim(),
        relation: String(person.relation ?? person.kinship ?? "").trim(),
        years: String(person.years ?? "").trim(),
        generation: Number(person.generation ?? 0),
        gender: GENDER_LABELS[person.gender] ? person.gender : "unknown",
        // 指定が無ければ生没年から推測する（「1888-1962」は故人、「1948-」は存命）
        deceased: typeof person.deceased === "boolean" ? person.deceased : hasEndYear(person.years),
        memo: String(person.memo ?? "").trim(),
        photo: normalizePhoto(person.photo),
        position: normalizePosition(person.position),
        spouseId: spouseIds[0] ?? null,
        spouseIds,
        spouseRelationshipTypes: normalizeSpouseRelationshipTypes(person.spouseRelationshipTypes),
        parentIds: Array.isArray(person.parentIds) ? person.parentIds.map(Number).filter(Number.isFinite) : [],
        parentRelationshipTypes: normalizeParentRelationshipTypes(person.parentRelationshipTypes),
        relationshipType: person.relationshipType || "married",
        relationshipMeta: person.relationshipMeta || {}
      };
    })
    .filter((person) => Number.isFinite(person.id) && person.id > 0 && person.name)
    .sort((a, b) => a.generation - b.generation || a.id - b.id);
}


function normalizeParentRelationshipTypes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["biological", "adopted", "step", "unknown"]);
  return Object.fromEntries(Object.entries(value)
    .map(([parentId, type]) => [String(Number(parentId)), String(type)])
    .filter(([parentId, type]) => Number(parentId) > 0 && allowed.has(type)));
}

function normalizeSpouseIds(value, legacySpouseId) {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [legacySpouseId] : String(value).split(",");
  return [...new Set(raw.map(Number).filter((id) => Number.isFinite(id) && id > 0))];
}

function normalizeSpouseRelationshipTypes(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set(["married", "divorced", "widowed", "partner"]);
  return Object.fromEntries(Object.entries(value)
    .map(([spouseId, type]) => [String(Number(spouseId)), String(type)])
    .filter(([spouseId, type]) => Number(spouseId) > 0 && allowed.has(type)));
}

export function hasEndYear(years) {
  return /\d{3,4}\s*[-–—~〜]\s*\d{3,4}/.test(String(years ?? ""));
}

// 写真は「縮小済みのデータURL」だけを受け入れる。外部URLや巨大な画像は捨てる。
function normalizePhoto(value) {
  if (typeof value !== "string") return null;
  const photo = value.trim();
  if (!photo.startsWith("data:image/")) return null;
  if (photo.length > MAX_PHOTO_LENGTH) return null;
  return photo;
}

function normalizePosition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}





export function parentKey(parentIds) {
  return parentIds.slice().sort((a, b) => a - b).join(",");
}

export function yearStart(years) {
  const match = String(years || "").match(/(\d{4})/);
  return match ? Number(match[1]) : Infinity;
}

export function nextId(people) {
  return people.reduce((max, person) => Math.max(max, person.id), 0) + 1;
}

export function suggestRelationFor({ people, currentId, parentIds, hasSpouse, generation }) {
  if (parentIds.length) {
    const key = parentKey(parentIds);
    const siblings = people
      .filter((person) => parentKey(person.parentIds) === key)
      .sort((a, b) => yearStart(a.years) - yearStart(b.years) || a.id - b.id);
    const currentIndex = siblings.findIndex((person) => person.id === currentId);
    const order = currentIndex >= 0 ? currentIndex + 1 : siblings.length + 1;
    return { relation: `第${order}子`, message: "親IDから続柄候補を入れました。必要なら自由に修正できます。" };
  }
  if (hasSpouse) {
    return { relation: "配偶者", message: "配偶者の続柄候補を入れました。" };
  }
  return {
    relation: generation === 0 ? "先祖" : "本人",
    message: "続柄候補を入れました。必要なら自由に修正できます。"
  };
}

export const SPOUSE_RELATIONSHIP_LABELS = {
  married: "結婚",
  divorced: "離婚",
  widowed: "死別",
  partner: "パートナー"
};

export const PARENT_RELATIONSHIP_LABELS = {
  biological: "実親",
  adopted: "養親",
  step: "継親",
  unknown: "不明"
};

// 編集フォームが持つ下書き。IDは新規なら null で、保存時に採番する。
export function createDraft(person = null) {
  if (!person) {
    return {
      id: null,
      name: "",
      relation: "",
      years: "",
      generation: 0,
      gender: "unknown",
      deceased: false,
      memo: "",
      photo: null,
      parents: [],
      spouses: []
    };
  }
  return {
    id: person.id,
    name: person.name,
    relation: person.relation,
    years: person.years,
    generation: person.generation,
    gender: person.gender,
    deceased: person.deceased,
    memo: person.memo,
    photo: person.photo,
    parents: person.parentIds.map((id) => ({
      id,
      type: person.parentRelationshipTypes[String(id)] || "biological"
    })),
    spouses: person.spouseIds.map((id) => ({
      id,
      type: person.spouseRelationshipTypes[String(id)] || person.relationshipType || "married"
    }))
  };
}

export function validateDraft(draft) {
  const errors = {};
  if (!String(draft.name ?? "").trim()) errors.name = "氏名を入力してください。";
  const generation = Number(draft.generation);
  if (!Number.isFinite(generation) || generation < 0) errors.generation = "世代は0以上の数字で入力してください。";
  return errors;
}

// 親を選ぶと世代が決まる。親がいなければ null（利用者の入力を尊重する）。
export function suggestedGeneration(people, parentIds) {
  const generations = parentIds
    .map((id) => people.find((person) => person.id === id)?.generation)
    .filter((value) => Number.isFinite(value));
  return generations.length ? Math.max(...generations) + 1 : null;
}

function normalizeRelationEntries(entries, selfId, fallbackType, limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const entry of entries ?? []) {
    const id = Number(entry?.id);
    if (!Number.isFinite(id) || id <= 0 || id === selfId || seen.has(id)) continue;
    seen.add(id);
    result.push({ id, type: entry?.type || fallbackType });
    if (result.length >= limit) break;
  }
  return result;
}

// 下書きを people に反映する。配偶者は相手側のリンクもここで揃える。
export function applyPersonEdit(people, draft) {
  const id = draft.id ?? nextId(people);
  const previous = people.find((person) => person.id === id) ?? null;
  const parents = normalizeRelationEntries(draft.parents, id, "biological", 2);
  const spouses = normalizeRelationEntries(draft.spouses, id, "married");

  const person = {
    id,
    name: String(draft.name ?? "").trim(),
    relation: String(draft.relation ?? "").trim(),
    years: String(draft.years ?? "").trim(),
    generation: Number(draft.generation),
    gender: GENDER_LABELS[draft.gender] ? draft.gender : "unknown",
    deceased: Boolean(draft.deceased),
    memo: String(draft.memo ?? "").trim(),
    photo: normalizePhoto(draft.photo),
    position: previous?.position ?? null,
    spouseId: spouses[0]?.id ?? null,
    spouseIds: spouses.map((entry) => entry.id),
    spouseRelationshipTypes: Object.fromEntries(spouses.map((entry) => [String(entry.id), entry.type])),
    parentIds: parents.map((entry) => entry.id),
    parentRelationshipTypes: Object.fromEntries(parents.map((entry) => [String(entry.id), entry.type])),
    relationshipType: spouses[0]?.type ?? "married",
    relationshipMeta: previous?.relationshipMeta ?? {}
  };

  const next = people.map((item) => ({
    ...item,
    spouseIds: [...item.spouseIds],
    spouseRelationshipTypes: { ...item.spouseRelationshipTypes }
  }));
  const index = next.findIndex((item) => item.id === id);
  if (index >= 0) next[index] = person;
  else next.push(person);

  const spouseIdSet = new Set(person.spouseIds);
  for (const other of next) {
    if (other.id === id) continue;
    const linked = other.spouseIds.includes(id);
    if (spouseIdSet.has(other.id)) {
      if (!linked) other.spouseIds.push(id);
      other.spouseRelationshipTypes[String(id)] = person.spouseRelationshipTypes[String(other.id)];
    } else if (linked) {
      other.spouseIds = other.spouseIds.filter((spouseId) => spouseId !== id);
      delete other.spouseRelationshipTypes[String(id)];
    }
    other.spouseId = other.spouseIds[0] ?? null;
  }

  return { people: normalizePeople(next), id };
}

// 人物一覧に出す説明。IDではなく名前で関係を示す。
export function describeRelations(person, people) {
  const nameOf = (id) => people.find((item) => item.id === id)?.name || `#${id}`;
  const parts = [`第${person.generation}世代`];
  if (person.relation) parts.unshift(person.relation);
  if (person.gender !== "unknown") parts.push(GENDER_LABELS[person.gender]);
  if (person.years) parts.push(person.years);
  if (person.deceased) parts.push("故人");
  if (person.spouseIds.length) parts.push(`配偶者: ${person.spouseIds.map(nameOf).join("、")}`);
  if (person.parentIds.length) parts.push(`親: ${person.parentIds.map(nameOf).join("、")}`);
  return parts.join(" / ");
}
