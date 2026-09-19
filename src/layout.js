// 世代ごとの自動配置。人物データと用紙サイズだけから座標を決める純粋な処理。
import { clamp, normalizePeople } from "./data.js";


export function buildLayout(sourcePeople, width, height) {
  const sorted = normalizePeople(sourcePeople);
  const personMap = new Map(sorted.map((person) => [person.id, person]));
  const generations = [...new Set(sorted.map((person) => person.generation))].sort((a, b) => a - b);
  const box = { w: 156, h: 72 };
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
      const start = cursor;
      unit.center = start + unit.width / 2;
      unit.y = y;
      unit.people.forEach((unitPerson, index) => {
        positions.set(unitPerson.id, { x: start + box.w / 2 + index * (box.w + coupleGap), y });
      });
      cursor += unit.width + unitGap;
    }
    unitsByGeneration.set(generation, units);
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

  return { people: sorted, personMap, positions: scaled, generations, box: scaledBox, scale, unitsByGeneration };
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
