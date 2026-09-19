// 人物データの正規化・入力値の解釈・続柄の推定。
// DOMもCanvasも触らない純粋な処理だけを置く（tests/unit から直接読み込む）。

export const PAPER_SIZES = {
  a3: { key: "a3", label: "A3", widthMm: 420, heightMm: 297, ratio: 420 / 297 },
  a4: { key: "a4", label: "A4", widthMm: 297, heightMm: 210, ratio: 297 / 210 }
};

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

for (const person of samplePeople) person.relation = sampleRelationLabels[person.id] || "";

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

export function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizePosition(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : null;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseParentIds(value) {
  return value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isFinite(id) && id > 0)
    .slice(0, 2);
}

export function parseSpouseIds(value) {
  return normalizeSpouseIds(String(value || "").split(","), null);
}

export function buildSpouseRelationshipTypes(value, selectedType, previousTypes = {}) {
  const spouseIds = parseSpouseIds(value);
  if (selectedType === "mixed") {
    return Object.fromEntries(spouseIds.map((spouseId) => [
      String(spouseId), previousTypes[String(spouseId)] || "married"
    ]));
  }
  return Object.fromEntries(spouseIds.map((spouseId) => [String(spouseId), selectedType]));
}

export function buildParentRelationshipTypes(value, selectedType, previousTypes = {}) {
  const parentIds = parseParentIds(value);
  if (selectedType === "mixed") {
    return Object.fromEntries(parentIds.map((parentId) => [
      String(parentId), previousTypes[String(parentId)] || "biological"
    ]));
  }
  return Object.fromEntries(parentIds.map((parentId) => [String(parentId), selectedType]));
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
