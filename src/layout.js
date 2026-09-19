// 世代ごとの自動配置。人物データと用紙サイズだけから座標を決める純粋な処理。
import { clamp, normalizePeople } from "./data.js";


export function buildLayout(sourcePeople, width, height) {
  const sorted = normalizePeople(sourcePeople);
  const personMap = new Map(sorted.map((person) => [person.id, person]));
  const generations = [...new Set(sorted.map((person) => person.generation))].sort((a, b) => a - b);
  // 写真や備考がある家系図では、枠を縦に広げて収める
  const content = {
    photos: sorted.some((person) => Boolean(person.photo)),
    memos: sorted.some((person) => Boolean(person.memo))
  };
  const box = { w: 156, h: 72 + (content.photos ? 46 : 0) + (content.memos ? 16 : 0) };
  const coupleGap = 18;
  const unitGap = 46;
  const margin = 78;
  const yGap = generations.length > 1 ? (height - margin * 2) / (generations.length - 1) : 0;
  const positions = new Map();
  const unitsByGeneration = new Map();

  for (const generation of generations) {
    const members = sorted.filter((person) => person.generation === generation);
    const orderScore = (person) => {
      const parentXs = person.parentIds.map((id) => positions.get(id)?.x).filter(Number.isFinite);
      if (parentXs.length) return parentXs.reduce((sum, x) => sum + x, 0) / parentXs.length;
      return person.id * 10000;
    };
    members.sort((a, b) => orderScore(a) - orderScore(b) || a.id - b.id);

    const memberMap = new Map(members.map((person) => [person.id, person]));
    const visited = new Set();
    const units = [];
    for (const person of members) {
      if (visited.has(person.id)) continue;
      const component = [];
      const queue = [person];
      visited.add(person.id);
      while (queue.length) {
        const current = queue.shift();
        component.push(current);
        for (const spouseId of current.spouseIds) {
          const spouse = memberMap.get(spouseId);
          if (spouse && !visited.has(spouse.id)) {
            visited.add(spouse.id);
            queue.push(spouse);
          }
        }
      }
      component.sort((a, b) => orderScore(a) - orderScore(b) || a.id - b.id);
      units.push({ people: component, width: box.w * component.length + coupleGap * Math.max(0, component.length - 1) });
    }

    const totalWidth = units.reduce((sum, unit) => sum + unit.width, 0) + Math.max(0, units.length - 1) * unitGap;
    let cursor = -totalWidth / 2;
    const y = margin + generations.indexOf(generation) * yGap;
    for (const unit of units) {
      unit.center = cursor + unit.width / 2;
      unit.y = y;
      cursor += unit.width + unitGap;
    }
    unitsByGeneration.set(generation, units);
  }

  alignFamilies(sorted, generations, unitsByGeneration, unitGap);

  for (const units of unitsByGeneration.values()) {
    for (const unit of units) {
      const start = unit.center - unit.width / 2;
      unit.people.forEach((unitPerson, index) => {
        positions.set(unitPerson.id, { x: start + box.w / 2 + index * (box.w + coupleGap), y: unit.y });
      });
    }
  }

  const rawBounds = getBounds([...positions.values()], box);
  const contentWidth = rawBounds.maxX - rawBounds.minX;
  const contentHeight = rawBounds.maxY - rawBounds.minY;
  const scale = Math.min((width - margin * 2) / contentWidth, (height - margin * 2) / contentHeight, 1.35);
  const offsetX = width / 2 - ((rawBounds.minX + rawBounds.maxX) / 2) * scale;
  const offsetY = height / 2 - ((rawBounds.minY + rawBounds.maxY) / 2) * scale;
  const scaled = new Map();
  for (const [id, pos] of positions) {
    scaled.set(id, { x: pos.x * scale + offsetX, y: pos.y * scale + offsetY });
  }
  const scaledBox = { w: box.w * scale, h: box.h * scale };
  for (const person of sorted) {
    if (!person.position) continue;
    scaled.set(person.id, {
      x: clamp(person.position.x * width, scaledBox.w / 2 + 12, width - scaledBox.w / 2 - 12),
      y: clamp(person.position.y * height, scaledBox.h / 2 + 12, height - scaledBox.h / 2 - 12)
    });
  }

  return { people: sorted, personMap, positions: scaled, generations, box: scaledBox, scale, unitsByGeneration, content };
}

// 親のまとまりを子の真ん中へ、子のまとまりを親の真ん中へ寄せる往復を数回くり返す。
// 左右の順番は動かさないので、線の交差が増えることはない。
function alignFamilies(people, generations, unitsByGeneration, unitGap) {
  if (generations.length < 2) return;

  const unitOf = new Map();
  for (const units of unitsByGeneration.values()) {
    for (const unit of units) {
      for (const person of unit.people) unitOf.set(person.id, unit);
    }
  }

  const childUnits = new Map();
  const parentUnits = new Map();
  for (const child of people) {
    const childUnit = unitOf.get(child.id);
    for (const parentId of child.parentIds) {
      const parentUnit = unitOf.get(parentId);
      if (!parentUnit || !childUnit || parentUnit === childUnit) continue;
      if (!childUnits.has(parentUnit)) childUnits.set(parentUnit, new Set());
      childUnits.get(parentUnit).add(childUnit);
      if (!parentUnits.has(childUnit)) parentUnits.set(childUnit, new Set());
      parentUnits.get(childUnit).add(parentUnit);
    }
  }

  const relatedOf = (map) => (unit) => [...(map.get(unit) ?? [])];
  for (let pass = 0; pass < 6; pass += 1) {
    // 先に「子を親の下へ」、最後に「親を子の上へ」。家系図は親が子の真ん中に
    // 来ている方が読みやすいので、締めくくりを下から上の調整にしている。
    for (let index = 1; index < generations.length; index += 1) {
      alignGeneration(unitsByGeneration.get(generations[index]), relatedOf(parentUnits), unitGap);
    }
    for (let index = generations.length - 2; index >= 0; index -= 1) {
      alignGeneration(unitsByGeneration.get(generations[index]), relatedOf(childUnits), unitGap);
    }
  }
}

function alignGeneration(units, relatedOf, unitGap) {
  if (!units || units.length === 0) return;

  const desired = units.map((unit) => {
    const related = relatedOf(unit);
    if (!related.length) return unit.center;
    return related.reduce((sum, other) => sum + other.center, 0) / related.length;
  });

  // 順番を保ったまま、重なる分だけ右へ押し出す
  const placed = desired.slice();
  for (let index = 1; index < placed.length; index += 1) {
    const minCenter = placed[index - 1] + units[index - 1].width / 2 + unitGap + units[index].width / 2;
    if (placed[index] < minCenter) placed[index] = minCenter;
  }

  // 押し出した分だけ右に寄るので、狙いの中心に合わせて戻す
  const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const shift = mean(desired) - mean(placed);
  units.forEach((unit, index) => {
    unit.center = placed[index] + shift;
  });
}

function getBounds(points, box) {
  if (!points.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return points.reduce((bounds, pos) => ({
    minX: Math.min(bounds.minX, pos.x - box.w / 2),
    maxX: Math.max(bounds.maxX, pos.x + box.w / 2),
    minY: Math.min(bounds.minY, pos.y - box.h / 2),
    maxY: Math.max(bounds.maxY, pos.y + box.h / 2)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}
