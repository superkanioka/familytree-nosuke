// Canvasへの描画。DOMには触れず、配色は呼び出し側から受け取る。
import { buildLayout } from "./layout.js";

// 用紙は常に白なので、線の色はテーマではなく印刷結果に合わせる。
export const DEFAULT_COLORS = { marriage: "#8f4b53", child: "#3f4947" };


export function drawFamilyTree(targetCanvas, sourcePeople, colors = DEFAULT_COLORS) {
  const ctx = targetCanvas.getContext("2d");
  const width = targetCanvas.width;
  const height = targetCanvas.height;
  const layout = buildLayout(sourcePeople, width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGenerationBands(ctx, layout, width);
  drawParentLines(ctx, layout, colors);
  drawMarriageLines(ctx, layout, colors);
  for (const person of layout.people) {
    drawPerson(ctx, person, layout.positions.get(person.id), layout.box);
  }
  return layout;
}

function drawGenerationBands(ctx, layout, width) {
  ctx.save();
  ctx.font = `${Math.max(11, 13 * layout.scale)}px Roboto, "Noto Sans JP", system-ui, sans-serif`;
  ctx.fillStyle = "#6f7976";
  ctx.strokeStyle = "#e3e9e7";
  ctx.lineWidth = Math.max(1, layout.scale);
  for (const generation of layout.generations) {
    const first = layout.people.find((person) => person.generation === generation);
    const y = first ? layout.positions.get(first.id).y : 0;
    ctx.beginPath();
    ctx.moveTo(36, y);
    ctx.lineTo(width - 36, y);
    ctx.stroke();
    ctx.fillText(`第${generation}世代`, 42, y - layout.box.h / 2 - 12);
  }
  ctx.restore();
}

function drawMarriageLines(ctx, layout, colors = DEFAULT_COLORS) {
  const drawn = new Set();
  ctx.save();
  ctx.lineWidth = Math.max(2, 2.5 * layout.scale);
  ctx.strokeStyle = colors.marriage;
  for (const person of layout.people) {
    for (const spouseId of person.spouseIds) {
      const pairKey = [person.id, spouseId].sort((a, b) => a - b).join(":");
      if (drawn.has(pairKey)) continue;
      const spouse = layout.personMap.get(spouseId);
      const a = layout.positions.get(person.id);
      const b = layout.positions.get(spouseId);
      if (!spouse || !a || !b || spouse.generation !== person.generation) continue;
      const left = a.x < b.x ? a : b;
      const right = a.x < b.x ? b : a;
      const relationshipType = person.spouseRelationshipTypes[String(spouseId)] || person.relationshipType || "married";
      const lineStyle = getSpouseLineStyle(relationshipType, colors);
      ctx.setLineDash(lineStyle.dash.map((value) => value * layout.scale));
      ctx.strokeStyle = lineStyle.color;
      ctx.beginPath();
      ctx.moveTo(left.x + layout.box.w / 2, left.y);
      ctx.lineTo(right.x - layout.box.w / 2, right.y);
      ctx.stroke();
      drawn.add(pairKey);
    }
  }
  ctx.restore();
}

export function getSpouseLineStyle(relationshipType, colors = DEFAULT_COLORS) {
  if (relationshipType === "divorced") return { color: "#ba1a1a", dash: [8, 6] };
  if (relationshipType === "widowed") return { color: "#6f7976", dash: [2, 5] };
  return { color: colors.marriage, dash: [] };
}

function drawParentLines(ctx, layout, colors = DEFAULT_COLORS) {
  const groups = new Map();
  for (const child of layout.people) {
    if (!child.parentIds.length) continue;
    const parentIds = child.parentIds.slice().sort((a, b) => a - b);
    const parentTypes = parentIds.map((parentId) => child.parentRelationshipTypes[String(parentId)] || "biological");
    const key = `${parentIds.join(",")}|${parentTypes.join(",")}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(child);
  }

  ctx.save();
  ctx.strokeStyle = colors.child;
  ctx.lineWidth = Math.max(1.4, 2 * layout.scale);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const [groupKey, children] of groups) {
    const [parentKey, typeKey] = groupKey.split("|");
    const parentIds = parentKey.split(",").map(Number);
    const parentTypes = typeKey.split(",");
    const parentPositions = parentIds.map((id) => layout.positions.get(id)).filter(Boolean);
    const childPositions = children.map((child) => layout.positions.get(child.id)).filter(Boolean);
    if (!parentPositions.length || !childPositions.length) continue;
    const parentBottomY = Math.max(...parentPositions.map((pos) => pos.y + layout.box.h / 2));
    const childTopY = Math.min(...childPositions.map((pos) => pos.y - layout.box.h / 2));
    const verticalGap = Math.max(12 * layout.scale, childTopY - parentBottomY);
    const busY = parentBottomY + verticalGap * 0.48;
    const parentXs = parentPositions.map((pos) => pos.x);
    const childXs = childPositions.map((pos) => pos.x);
    const minBusX = Math.min(...parentXs, ...childXs);
    const maxBusX = Math.max(...parentXs, ...childXs);

    const lineStyle = getParentLineStyle(parentTypes, colors);
    ctx.strokeStyle = lineStyle.color;
    ctx.setLineDash(lineStyle.dash.map((value) => value * layout.scale));
    ctx.beginPath();
    for (const parentPos of parentPositions) {
      ctx.moveTo(parentPos.x, parentPos.y + layout.box.h / 2);
      ctx.lineTo(parentPos.x, busY);
    }
    ctx.moveTo(minBusX, busY);
    ctx.lineTo(maxBusX, busY);
    for (const childPos of childPositions) {
      ctx.moveTo(childPos.x, busY);
      ctx.lineTo(childPos.x, childPos.y - layout.box.h / 2);
    }
    ctx.stroke();
  }
  ctx.restore();
}

export function getParentLineStyle(parentTypes, colors = DEFAULT_COLORS) {
  if (parentTypes.includes("adopted")) return { color: "#8a5a2b", dash: [7, 5] };
  if (parentTypes.includes("step")) return { color: "#46617a", dash: [2, 5] };
  if (parentTypes.includes("unknown")) return { color: "#6f7976", dash: [5, 4] };
  return { color: colors.child, dash: [] };
}

function drawPerson(ctx, person, pos, box) {
  if (!pos) return;
  const x = pos.x - box.w / 2;
  const y = pos.y - box.h / 2;
  const radius = Math.min(18, 14 * Math.max(0.7, box.w / 156));

  ctx.save();
  roundedRect(ctx, x, y, box.w, box.h, radius);
  ctx.fillStyle = "#f2f9f7";
  ctx.fill();
  ctx.strokeStyle = "#a8c5c0";
  ctx.lineWidth = Math.max(1, 1.2 * box.w / 156);
  ctx.stroke();

  ctx.fillStyle = "#171d1b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const nameSize = Math.max(9, 15 * box.w / 156);
  const relationSize = Math.max(8, 10 * box.w / 156);
  const yearsSize = Math.max(8, 11 * box.w / 156);
  ctx.font = `700 ${nameSize}px Roboto, "Noto Sans JP", system-ui, "Yu Gothic", sans-serif`;
  fitText(ctx, person.name, pos.x, person.relation ? pos.y - relationSize * 1.7 : pos.y - yearsSize * 0.55, box.w - 16);
  if (person.relation) {
    ctx.font = `600 ${relationSize}px Roboto, "Noto Sans JP", system-ui, "Yu Gothic", sans-serif`;
    ctx.fillStyle = "#006a63";
    fitText(ctx, person.relation, pos.x, pos.y, box.w - 18);
  }
  ctx.font = `${yearsSize}px Roboto, "Noto Sans JP", system-ui, "Yu Gothic", sans-serif`;
  ctx.fillStyle = "#3f4947";
  fitText(ctx, person.years || `ID ${person.id}`, pos.x, pos.y + (person.relation ? relationSize * 1.7 : yearsSize * 1.05), box.w - 18);
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function fitText(ctx, text, x, y, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    ctx.fillText(text, x, y);
    return;
  }
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  ctx.fillText(`${clipped}…`, x, y);
}
