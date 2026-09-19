import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildParentRelationshipTypes,
  buildSpouseRelationshipTypes,
  nextId,
  normalizePeople,
  parentKey,
  parseParentIds,
  parseSpouseIds,
  samplePeople,
  suggestRelationFor,
  yearStart
} from "../../src/data.js";

describe("normalizePeople", () => {
  it("氏名のない人物とIDが不正な人物を落とす", () => {
    const people = normalizePeople([
      { id: 1, name: "有効" },
      { id: 2, name: "   " },
      { id: 0, name: "ID不正" },
      { id: "x", name: "ID不正" },
      { name: "IDなし" }
    ]);
    assert.deepEqual(people.map((person) => person.id), [1]);
  });

  it("旧形式の spouseId を spouseIds に引き継ぐ", () => {
    const [person] = normalizePeople([{ id: 1, name: "旧形式", spouseId: 2 }]);
    assert.deepEqual(person.spouseIds, [2]);
    assert.equal(person.spouseId, 2);
  });

  it("spouseIds の重複と不正値を取り除く", () => {
    const [person] = normalizePeople([{ id: 1, name: "重複", spouseIds: [2, 2, "3", 0, -1, "x"] }]);
    assert.deepEqual(person.spouseIds, [2, 3]);
  });

  it("旧フィールド kinship を relation として読む", () => {
    const [person] = normalizePeople([{ id: 1, name: "旧続柄", kinship: "長男" }]);
    assert.equal(person.relation, "長男");
  });

  it("世代順・ID順に並べ替える", () => {
    const people = normalizePeople([
      { id: 5, name: "後", generation: 1 },
      { id: 2, name: "先", generation: 0 },
      { id: 1, name: "同世代", generation: 1 }
    ]);
    assert.deepEqual(people.map((person) => person.id), [2, 1, 5]);
  });

  it("position を 0〜1 に丸め、壊れていれば null にする", () => {
    const [clamped] = normalizePeople([{ id: 1, name: "範囲外", position: { x: 1.8, y: -0.5 } }]);
    assert.deepEqual(clamped.position, { x: 1, y: 0 });

    for (const broken of [{ x: "a", y: 0.5 }, [0.5, 0.5], "0.5", null]) {
      const [person] = normalizePeople([{ id: 1, name: "壊れた位置", position: broken }]);
      assert.equal(person.position, null, `position: ${JSON.stringify(broken)}`);
    }
  });

  it("知らない親子関係の種別は捨てる", () => {
    const [person] = normalizePeople([
      { id: 3, name: "子", parentIds: [1, 2], parentRelationshipTypes: { 1: "adopted", 2: "でたらめ" } }
    ]);
    assert.deepEqual(person.parentRelationshipTypes, { 1: "adopted" });
  });

  it("配列以外を渡されても落ちない", () => {
    for (const input of [null, undefined, {}, "人物", 42]) {
      assert.deepEqual(normalizePeople(input), []);
    }
  });

  it("同梱のサンプルデータは正規化しても件数が変わらない", () => {
    assert.equal(normalizePeople(structuredClone(samplePeople)).length, samplePeople.length);
  });
});

describe("入力欄の解釈", () => {
  it("親IDは2人までで、不正値を無視する", () => {
    assert.deepEqual(parseParentIds("1, 2 ,3"), [1, 2]);
    assert.deepEqual(parseParentIds("ふたり, 2"), [2]);
    assert.deepEqual(parseParentIds(""), []);
  });

  it("配偶者IDは重複を除いて複数受け取る", () => {
    assert.deepEqual(parseSpouseIds("2,5,2"), [2, 5]);
    assert.deepEqual(parseSpouseIds(""), []);
    assert.deepEqual(parseSpouseIds(null), []);
  });
});

describe("関係種別の組み立て", () => {
  it("選んだ種別を全員に適用する", () => {
    assert.deepEqual(buildSpouseRelationshipTypes("2,3", "divorced"), { 2: "divorced", 3: "divorced" });
    assert.deepEqual(buildParentRelationshipTypes("1,2", "adopted"), { 1: "adopted", 2: "adopted" });
  });

  it("mixed のときは既存の種別を保持し、未設定は既定値にする", () => {
    assert.deepEqual(
      buildSpouseRelationshipTypes("2,3", "mixed", { 2: "widowed" }),
      { 2: "widowed", 3: "married" }
    );
    assert.deepEqual(
      buildParentRelationshipTypes("1,2", "mixed", { 1: "step" }),
      { 1: "step", 2: "biological" }
    );
  });

  it("入力が空なら空のまま", () => {
    assert.deepEqual(buildSpouseRelationshipTypes("", "married"), {});
  });
});

describe("小さなヘルパー", () => {
  it("nextId は最大ID+1、空なら1", () => {
    assert.equal(nextId([{ id: 3 }, { id: 7 }, { id: 5 }]), 8);
    assert.equal(nextId([]), 1);
  });

  it("parentKey は並び順に依存しない", () => {
    assert.equal(parentKey([2, 1]), parentKey([1, 2]));
  });

  it("yearStart は最初の4桁を読み、無ければ Infinity", () => {
    assert.equal(yearStart("1930-2005"), 1930);
    assert.equal(yearStart("昭和5年"), Infinity);
    assert.equal(yearStart(""), Infinity);
    assert.equal(yearStart(undefined), Infinity);
  });
});

describe("suggestRelationFor", () => {
  const people = normalizePeople([
    { id: 1, name: "父", generation: 0 },
    { id: 2, name: "母", generation: 0 },
    { id: 3, name: "長子", generation: 1, years: "1970-", parentIds: [1, 2] },
    { id: 4, name: "次子", generation: 1, years: "1975-", parentIds: [2, 1] }
  ]);

  it("既にいる子は生年順の位置を返す", () => {
    const first = suggestRelationFor({ people, currentId: 3, parentIds: [1, 2], hasSpouse: false, generation: 1 });
    const second = suggestRelationFor({ people, currentId: 4, parentIds: [1, 2], hasSpouse: false, generation: 1 });
    assert.equal(first.relation, "第1子");
    assert.equal(second.relation, "第2子");
  });

  it("新しい子は末子として提案する", () => {
    const suggestion = suggestRelationFor({ people, currentId: 9, parentIds: [1, 2], hasSpouse: false, generation: 1 });
    assert.equal(suggestion.relation, "第3子");
  });

  it("親IDの並び順が違っても同じ兄弟として数える", () => {
    const suggestion = suggestRelationFor({ people, currentId: 9, parentIds: [2, 1], hasSpouse: false, generation: 1 });
    assert.equal(suggestion.relation, "第3子");
  });

  it("親がいなければ配偶者、どちらも無ければ世代で判断する", () => {
    assert.equal(suggestRelationFor({ people, currentId: 9, parentIds: [], hasSpouse: true, generation: 1 }).relation, "配偶者");
    assert.equal(suggestRelationFor({ people, currentId: 9, parentIds: [], hasSpouse: false, generation: 0 }).relation, "先祖");
    assert.equal(suggestRelationFor({ people, currentId: 9, parentIds: [], hasSpouse: false, generation: 2 }).relation, "本人");
  });

  it("必ず画面に出す文言を添える", () => {
    const suggestion = suggestRelationFor({ people, currentId: 9, parentIds: [1], hasSpouse: false, generation: 1 });
    assert.match(suggestion.message, /続柄候補/);
  });
});
