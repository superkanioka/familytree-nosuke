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

describe("親子の中心をそろえる", () => {
  const midpoint = (layout, ids) => {
    const xs = ids.map((id) => layout.positions.get(id).x);
    return (Math.min(...xs) + Math.max(...xs)) / 2;
  };

  it("夫婦の中心が子どもたちの中心と重なる", () => {
    const family = normalizePeople([
      { id: 1, name: "父", generation: 0, spouseIds: [2] },
      { id: 2, name: "母", generation: 0, spouseIds: [1] },
      { id: 3, name: "長男", generation: 1, parentIds: [1, 2] },
      { id: 4, name: "次男", generation: 1, parentIds: [1, 2] },
      { id: 5, name: "三男", generation: 1, parentIds: [1, 2] }
    ]);
    const layout = buildLayout(family, WIDTH, HEIGHT);
    const parents = midpoint(layout, [1, 2]);
    const children = midpoint(layout, [3, 4, 5]);
    assert.ok(Math.abs(parents - children) < 1, `親 ${parents} / 子 ${children}`);
  });

  it("子の人数が偏っていても、それぞれの親の上に子が来る", () => {
    const family = normalizePeople([
      { id: 1, name: "祖父", generation: 0, spouseIds: [2] },
      { id: 2, name: "祖母", generation: 0, spouseIds: [1] },
      { id: 3, name: "長男", generation: 1, parentIds: [1, 2], spouseIds: [4] },
      { id: 4, name: "長男の妻", generation: 1, spouseIds: [3] },
      { id: 5, name: "次男", generation: 1, parentIds: [1, 2], spouseIds: [6] },
      { id: 6, name: "次男の妻", generation: 1, spouseIds: [5] },
      { id: 7, name: "孫A", generation: 2, parentIds: [3, 4] },
      { id: 8, name: "孫B", generation: 2, parentIds: [3, 4] },
      { id: 9, name: "孫C", generation: 2, parentIds: [3, 4] },
      { id: 10, name: "孫D", generation: 2, parentIds: [5, 6] }
    ]);
    const layout = buildLayout(family, WIDTH, HEIGHT);
    assert.ok(Math.abs(midpoint(layout, [3, 4]) - midpoint(layout, [7, 8, 9])) < 1, "長男夫婦");
    assert.ok(Math.abs(midpoint(layout, [5, 6]) - layout.positions.get(10).x) < 1, "次男夫婦");
  });

  it("中心をそろえても人物枠は重ならない", () => {
    const family = normalizePeople([
      { id: 1, name: "父", generation: 0, spouseIds: [2] },
      { id: 2, name: "母", generation: 0, spouseIds: [1] },
      ...Array.from({ length: 6 }, (_, index) => ({
        id: 10 + index,
        name: `子${index + 1}`,
        generation: 1,
        parentIds: [1, 2]
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        id: 30 + index,
        name: `孫${index + 1}`,
        generation: 2,
        parentIds: [10]
      }))
    ]);
    const layout = buildLayout(family, WIDTH, HEIGHT);
    for (const generation of layout.generations) {
      const xs = layout.people
        .filter((person) => person.generation === generation)
        .map((person) => layout.positions.get(person.id).x)
        .sort((a, b) => a - b);
      for (let index = 1; index < xs.length; index += 1) {
        assert.ok(xs[index] - xs[index - 1] >= layout.box.w - 0.5,
          `第${generation}世代で枠が重なった: ${xs[index - 1]} / ${xs[index]}`);
      }
    }
  });

  it("左右の並び順は変えない（線の交差を増やさない）", () => {
    const family = normalizePeople([
      { id: 1, name: "親A", generation: 0 },
      { id: 2, name: "親B", generation: 0 },
      { id: 3, name: "Aの子", generation: 1, parentIds: [1] },
      { id: 4, name: "Bの子", generation: 1, parentIds: [2] }
    ]);
    const layout = buildLayout(family, WIDTH, HEIGHT);
    assert.ok(layout.positions.get(1).x < layout.positions.get(2).x, "親の順");
    assert.ok(layout.positions.get(3).x < layout.positions.get(4).x, "子の順");
  });

  it("同じ入力なら同じ配置になる", () => {
    const family = normalizePeople(structuredClone(samplePeople));
    const first = buildLayout(family, WIDTH, HEIGHT);
    const second = buildLayout(family, WIDTH, HEIGHT);
    for (const [id, pos] of first.positions) {
      assert.deepEqual(second.positions.get(id), pos, `id=${id}`);
    }
  });
});

describe("枠の大きさ", () => {
  it("写真や備考があるときは枠を縦に広げる", () => {
    const plain = normalizePeople([{ id: 1, name: "文字だけ", generation: 0 }]);
    const withMemo = normalizePeople([{ id: 1, name: "備考あり", generation: 0, memo: "東京在住" }]);
    const withPhoto = normalizePeople([
      { id: 1, name: "写真あり", generation: 0, photo: "data:image/jpeg;base64,abcd" }
    ]);
    assert.equal(buildLayout(plain, WIDTH, HEIGHT).content.photos, false);
    assert.equal(buildLayout(withMemo, WIDTH, HEIGHT).content.memos, true);
    assert.equal(buildLayout(withPhoto, WIDTH, HEIGHT).content.photos, true);

    const plainRatio = buildLayout(plain, WIDTH, HEIGHT).box.h / buildLayout(plain, WIDTH, HEIGHT).box.w;
    const photoRatio = buildLayout(withPhoto, WIDTH, HEIGHT).box.h / buildLayout(withPhoto, WIDTH, HEIGHT).box.w;
    assert.ok(photoRatio > plainRatio, `${photoRatio} > ${plainRatio}`);
  });
});
