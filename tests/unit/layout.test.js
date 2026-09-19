import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePeople, samplePeople } from "../../src/data.js";
import { buildLayout } from "../../src/layout.js";

const WIDTH = 1200;
const HEIGHT = 849;

const family = normalizePeople([
  { id: 1, name: "祖父", generation: 0, spouseIds: [2] },
  { id: 2, name: "祖母", generation: 0, spouseIds: [1] },
  { id: 3, name: "父", generation: 1, parentIds: [1, 2], spouseIds: [4] },
  { id: 4, name: "母", generation: 1, spouseIds: [3] },
  { id: 5, name: "子", generation: 2, parentIds: [3, 4] }
]);

describe("buildLayout", () => {
  it("世代ごとに同じ高さへ並べ、世代が進むほど下へ置く", () => {
    const layout = buildLayout(family, WIDTH, HEIGHT);
    const y = (id) => layout.positions.get(id).y;
    assert.equal(y(1), y(2));
    assert.equal(y(3), y(4));
    assert.ok(y(1) < y(3), "0世代より1世代が下");
    assert.ok(y(3) < y(5), "1世代より2世代が下");
  });

  it("夫婦を隣り合わせに置く", () => {
    const layout = buildLayout(family, WIDTH, HEIGHT);
    const gap = Math.abs(layout.positions.get(1).x - layout.positions.get(2).x);
    assert.ok(gap > 0, "重ならない");
    assert.ok(gap < layout.box.w * 2, `夫婦の間隔が広すぎる: ${gap}`);
  });

  it("全員が用紙の中に収まる", () => {
    const layout = buildLayout(family, WIDTH, HEIGHT);
    for (const [id, pos] of layout.positions) {
      assert.ok(pos.x - layout.box.w / 2 >= 0, `${id} が左にはみ出した`);
      assert.ok(pos.x + layout.box.w / 2 <= WIDTH, `${id} が右にはみ出した`);
      assert.ok(pos.y - layout.box.h / 2 >= 0, `${id} が上にはみ出した`);
      assert.ok(pos.y + layout.box.h / 2 <= HEIGHT, `${id} が下にはみ出した`);
    }
  });

  it("人数が増えても用紙内に収まるよう縮小する", () => {
    const crowd = normalizePeople(
      Array.from({ length: 40 }, (_, index) => ({ id: index + 1, name: `人物${index + 1}`, generation: 0 }))
    );
    const layout = buildLayout(crowd, WIDTH, HEIGHT);
    assert.ok(layout.scale < 1, `縮小されていない: ${layout.scale}`);
    for (const pos of layout.positions.values()) {
      assert.ok(pos.x - layout.box.w / 2 >= 0 && pos.x + layout.box.w / 2 <= WIDTH);
    }
  });

  it("手動配置は正規化座標として尊重する", () => {
    const manual = normalizePeople([
      { id: 1, name: "手動", generation: 0, position: { x: 0.25, y: 0.75 } },
      { id: 2, name: "自動", generation: 0 }
    ]);
    const layout = buildLayout(manual, WIDTH, HEIGHT);
    const pos = layout.positions.get(1);
    assert.ok(Math.abs(pos.x - WIDTH * 0.25) < 1, `x=${pos.x}`);
    assert.ok(Math.abs(pos.y - HEIGHT * 0.75) < 1, `y=${pos.y}`);
  });

  it("端に置かれた手動配置も枠ごと用紙内に押し戻す", () => {
    const manual = normalizePeople([{ id: 1, name: "端", generation: 0, position: { x: 0, y: 1 } }]);
    const layout = buildLayout(manual, WIDTH, HEIGHT);
    const pos = layout.positions.get(1);
    assert.ok(pos.x - layout.box.w / 2 >= 0, "左にはみ出した");
    assert.ok(pos.y + layout.box.h / 2 <= HEIGHT, "下にはみ出した");
  });

  it("用紙の比率が変わっても全員分の座標を返す", () => {
    const a4 = buildLayout(family, 1200, 849);
    const portrait = buildLayout(family, 600, 1400);
    assert.equal(a4.positions.size, family.length);
    assert.equal(portrait.positions.size, family.length);
  });

  it("人物がいなくても落ちない", () => {
    const layout = buildLayout([], WIDTH, HEIGHT);
    assert.equal(layout.people.length, 0);
    assert.equal(layout.positions.size, 0);
    assert.deepEqual(layout.generations, []);
  });

  it("サンプルデータの全世代を並べる", () => {
    const layout = buildLayout(normalizePeople(structuredClone(samplePeople)), WIDTH, HEIGHT);
    assert.equal(layout.positions.size, samplePeople.length);
    assert.deepEqual(layout.generations, [0, 1, 2, 3, 4]);
  });
});
