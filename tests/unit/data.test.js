import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyPersonEdit,
  createDraft,
  describeRelations,
  nextId,
  normalizePeople,
  parentKey,
  samplePeople,
  suggestRelationFor,
  suggestedGeneration,
  validateDraft,
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

describe("編集フォームの下書き", () => {
  const people = normalizePeople([
    { id: 1, name: "父", generation: 0, spouseIds: [2], spouseRelationshipTypes: { 2: "married" } },
    { id: 2, name: "母", generation: 0, spouseIds: [1], spouseRelationshipTypes: { 1: "married" } },
    {
      id: 3,
      name: "子",
      generation: 1,
      parentIds: [1, 2],
      parentRelationshipTypes: { 1: "biological", 2: "adopted" }
    }
  ]);

  it("新規は空の下書きを返す", () => {
    const draft = createDraft(null);
    assert.equal(draft.id, null);
    assert.equal(draft.name, "");
    assert.deepEqual(draft.parents, []);
    assert.deepEqual(draft.spouses, []);
  });

  it("既存の人物から関係と種別を取り出す", () => {
    const draft = createDraft(people.find((person) => person.id === 3));
    assert.equal(draft.id, 3);
    assert.deepEqual(draft.parents, [
      { id: 1, type: "biological" },
      { id: 2, type: "adopted" }
    ]);
  });

  it("旧データの relationshipType を配偶者の既定として拾う", () => {
    const [legacy] = normalizePeople([{ id: 9, name: "旧", spouseIds: [1], relationshipType: "divorced" }]);
    assert.deepEqual(createDraft(legacy).spouses, [{ id: 1, type: "divorced" }]);
  });

  it("氏名と世代を検証する", () => {
    assert.deepEqual(validateDraft({ name: "有効", generation: 0 }), {});
    assert.ok(validateDraft({ name: "   ", generation: 0 }).name);
    assert.ok(validateDraft({ name: "有効", generation: -1 }).generation);
    assert.ok(validateDraft({ name: "有効", generation: "せだい" }).generation);
  });

  it("親から世代を決める（親がいなければ null）", () => {
    assert.equal(suggestedGeneration(people, [1, 2]), 1);
    assert.equal(suggestedGeneration(people, [3]), 2);
    assert.equal(suggestedGeneration(people, []), null);
    assert.equal(suggestedGeneration(people, [999]), null);
  });

  it("関係はIDではなく名前で説明する", () => {
    const text = describeRelations(people.find((person) => person.id === 3), people);
    assert.match(text, /親: 父、母/);
    assert.doesNotMatch(text, /#/);
  });
});

describe("applyPersonEdit", () => {
  const base = normalizePeople([
    { id: 1, name: "父", generation: 0 },
    { id: 2, name: "母", generation: 0 },
    { id: 3, name: "子", generation: 1, parentIds: [1] }
  ]);

  it("IDのない下書きは採番して追加する", () => {
    const result = applyPersonEdit(base, {
      id: null, name: "新人", relation: "", years: "", generation: 2, parents: [], spouses: []
    });
    assert.equal(result.id, 4);
    assert.equal(result.people.length, 4);
    assert.equal(result.people.find((person) => person.id === 4).name, "新人");
  });

  it("既存の人物は上書きし、件数を増やさない", () => {
    const result = applyPersonEdit(base, {
      id: 3, name: "子（改名）", relation: "長男", years: "1980-", generation: 1,
      parents: [{ id: 1, type: "biological" }], spouses: []
    });
    assert.equal(result.people.length, 3);
    assert.equal(result.people.find((person) => person.id === 3).name, "子（改名）");
  });

  it("配偶者のリンクを相手側にも張る", () => {
    const result = applyPersonEdit(base, {
      id: 1, name: "父", relation: "", years: "", generation: 0,
      parents: [], spouses: [{ id: 2, type: "married" }]
    });
    const mother = result.people.find((person) => person.id === 2);
    assert.deepEqual(mother.spouseIds, [1]);
    assert.equal(mother.spouseRelationshipTypes["1"], "married");
    assert.equal(mother.spouseId, 1, "旧形式のspouseIdも揃える");
  });

  it("配偶者を外すと相手側のリンクも消える", () => {
    const linked = applyPersonEdit(base, {
      id: 1, name: "父", relation: "", years: "", generation: 0,
      parents: [], spouses: [{ id: 2, type: "married" }]
    }).people;
    const unlinked = applyPersonEdit(linked, {
      id: 1, name: "父", relation: "", years: "", generation: 0, parents: [], spouses: []
    }).people;
    assert.deepEqual(unlinked.find((person) => person.id === 2).spouseIds, []);
    assert.equal(unlinked.find((person) => person.id === 2).spouseId, null);
  });

  it("関係の種別変更は相手側にも伝わる", () => {
    const married = applyPersonEdit(base, {
      id: 1, name: "父", relation: "", years: "", generation: 0,
      parents: [], spouses: [{ id: 2, type: "married" }]
    }).people;
    const divorced = applyPersonEdit(married, {
      id: 1, name: "父", relation: "", years: "", generation: 0,
      parents: [], spouses: [{ id: 2, type: "divorced" }]
    }).people;
    assert.equal(divorced.find((person) => person.id === 2).spouseRelationshipTypes["1"], "divorced");
  });

  it("自分自身や重複は関係から取り除く", () => {
    const result = applyPersonEdit(base, {
      id: 3, name: "子", relation: "", years: "", generation: 1,
      parents: [{ id: 3, type: "biological" }, { id: 1, type: "biological" }, { id: 1, type: "adopted" }],
      spouses: [{ id: 3, type: "married" }]
    });
    const child = result.people.find((person) => person.id === 3);
    assert.deepEqual(child.parentIds, [1]);
    assert.deepEqual(child.spouseIds, []);
  });

  it("親は2人までに切り詰める", () => {
    const result = applyPersonEdit(base, {
      id: 3, name: "子", relation: "", years: "", generation: 1,
      parents: [{ id: 1, type: "biological" }, { id: 2, type: "biological" }, { id: 4, type: "step" }],
      spouses: []
    });
    assert.equal(result.people.find((person) => person.id === 3).parentIds.length, 2);
  });

  it("手動配置と拡張フィールドを保持する", () => {
    const positioned = normalizePeople([
      { id: 1, name: "配置済み", generation: 0, position: { x: 0.3, y: 0.4 } }
    ]);
    positioned[0].relationshipMeta = { memo: "残す" };
    const result = applyPersonEdit(positioned, {
      id: 1, name: "配置済み", relation: "", years: "", generation: 0, parents: [], spouses: []
    });
    const person = result.people.find((item) => item.id === 1);
    assert.deepEqual(person.position, { x: 0.3, y: 0.4 });
    assert.deepEqual(person.relationshipMeta, { memo: "残す" });
  });

  it("元の配列を書き換えない", () => {
    const before = structuredClone(base);
    applyPersonEdit(base, {
      id: 1, name: "書き換え", relation: "", years: "", generation: 0,
      parents: [], spouses: [{ id: 2, type: "married" }]
    });
    assert.deepEqual(base, before);
  });
});
