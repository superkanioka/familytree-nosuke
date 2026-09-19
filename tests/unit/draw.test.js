import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizePeople, samplePeople } from "../../src/data.js";
import { buildLayout } from "../../src/layout.js";
import { DEFAULT_COLORS, drawFamilyTree, getParentLineStyle, getSpouseLineStyle } from "../../src/draw.js";

// Canvas 2D の代わりに呼び出しを記録するだけのスタブ。
// draw.js が document や window に触れていれば、Nodeでは例外になって気づける。
function createStubCanvas(width = 1200, height = 849) {
  const calls = [];
  const assigned = { fillStyle: [], strokeStyle: [], font: [] };
  const record = (name) => (...args) => calls.push({ name, args });
  const ctx = {
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    save: record("save"),
    restore: record("restore"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    quadraticCurveTo: record("quadraticCurveTo"),
    closePath: record("closePath"),
    rect: record("rect"),
    arc: record("arc"),
    clip: record("clip"),
    drawImage: record("drawImage"),
    stroke: record("stroke"),
    fill: record("fill"),
    fillText: record("fillText"),
    setLineDash: record("setLineDash"),
    measureText: (text) => ({ width: String(text).length * 7 }),
    set fillStyle(value) { assigned.fillStyle.push(value); },
    get fillStyle() { return assigned.fillStyle.at(-1); },
    set strokeStyle(value) { assigned.strokeStyle.push(value); },
    get strokeStyle() { return assigned.strokeStyle.at(-1); },
    set font(value) { assigned.font.push(value); },
    get font() { return assigned.font.at(-1); },
    lineWidth: 1,
    textAlign: "start",
    textBaseline: "alphabetic",
    lineJoin: "miter",
    lineCap: "butt"
  };
  return { canvas: { width, height, getContext: () => ctx }, calls, assigned };
}

const family = normalizePeople([
  { id: 1, name: "祖父", generation: 0, spouseIds: [2] },
  { id: 2, name: "祖母", generation: 0, spouseIds: [1] },
  { id: 3, name: "子", generation: 1, parentIds: [1, 2] }
]);

describe("drawFamilyTree", () => {
  it("描画に使ったレイアウトを返す", () => {
    const { canvas } = createStubCanvas();
    const layout = drawFamilyTree(canvas, family);
    const expected = buildLayout(family, canvas.width, canvas.height);
    assert.equal(layout.people.length, family.length);
    assert.deepEqual(
      [...layout.positions.entries()],
      [...expected.positions.entries()]
    );
  });

  it("人物の数だけ角丸の枠を描く", () => {
    const { canvas, calls } = createStubCanvas();
    drawFamilyTree(canvas, family);
    // roundedRect は枠ひとつにつき4回 quadraticCurveTo を呼ぶ
    const corners = calls.filter((call) => call.name === "quadraticCurveTo").length;
    assert.equal(corners, family.length * 4);
  });

  it("氏名を描く", () => {
    const { canvas, calls } = createStubCanvas();
    drawFamilyTree(canvas, family);
    const drawnText = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    for (const person of family) {
      assert.ok(drawnText.includes(person.name), `${person.name} が描かれていない`);
    }
  });

  it("用紙を白で塗ってから描く", () => {
    const { canvas, calls, assigned } = createStubCanvas();
    drawFamilyTree(canvas, family);
    assert.equal(calls[0].name, "clearRect");
    assert.equal(calls[1].name, "fillRect");
    assert.deepEqual(calls[1].args, [0, 0, canvas.width, canvas.height]);
    assert.equal(assigned.fillStyle[0], "#ffffff");
  });

  it("渡した配色を線に使う", () => {
    const { canvas, assigned } = createStubCanvas();
    drawFamilyTree(canvas, family, { marriage: "#ff00ff", child: "#00ff00" });
    assert.ok(assigned.strokeStyle.includes("#ff00ff"), "婚姻線の色が使われていない");
    assert.ok(assigned.strokeStyle.includes("#00ff00"), "親子線の色が使われていない");
  });

  it("配色を渡さなければ印刷用の既定色を使う", () => {
    const { canvas, assigned } = createStubCanvas();
    drawFamilyTree(canvas, family);
    assert.ok(assigned.strokeStyle.includes(DEFAULT_COLORS.marriage));
    assert.ok(assigned.strokeStyle.includes(DEFAULT_COLORS.child));
  });

  it("人物がいなくても落ちない", () => {
    const { canvas } = createStubCanvas();
    const layout = drawFamilyTree(canvas, []);
    assert.equal(layout.people.length, 0);
  });

  it("サンプルデータ19人をDOMなしで描き切る", () => {
    const { canvas, calls } = createStubCanvas();
    const layout = drawFamilyTree(canvas, normalizePeople(structuredClone(samplePeople)));
    assert.equal(layout.people.length, samplePeople.length);
    assert.equal(calls.filter((call) => call.name === "quadraticCurveTo").length, samplePeople.length * 4);
  });
});

describe("関係線のスタイル", () => {
  it("離婚・死別は破線で描き分ける", () => {
    assert.ok(getSpouseLineStyle("divorced").dash.length > 0);
    assert.ok(getSpouseLineStyle("widowed").dash.length > 0);
    assert.notDeepEqual(getSpouseLineStyle("divorced"), getSpouseLineStyle("widowed"));
  });

  it("結婚は実線で、渡した色を使う", () => {
    const style = getSpouseLineStyle("married", { marriage: "#123456", child: "#000000" });
    assert.deepEqual(style, { color: "#123456", dash: [] });
  });

  it("知らない種別は結婚として扱う", () => {
    assert.deepEqual(getSpouseLineStyle("でたらめe"), getSpouseLineStyle("married"));
  });

  it("養親・継親・不明はそれぞれ違う破線にする", () => {
    const adopted = getParentLineStyle(["adopted"]);
    const step = getParentLineStyle(["step"]);
    const unknown = getParentLineStyle(["unknown"]);
    for (const style of [adopted, step, unknown]) {
      assert.ok(style.dash.length > 0);
    }
    assert.notDeepEqual(adopted, step);
    assert.notDeepEqual(step, unknown);
  });

  it("片方が養親なら破線を優先する", () => {
    assert.deepEqual(getParentLineStyle(["biological", "adopted"]), getParentLineStyle(["adopted"]));
  });

  it("実親は実線で、渡した色を使う", () => {
    const style = getParentLineStyle(["biological"], { marriage: "#000000", child: "#abcdef" });
    assert.deepEqual(style, { color: "#abcdef", dash: [] });
  });
});

describe("人物枠の描き分け", () => {
  const draw = (person, extra = {}) => {
    const { canvas, calls, assigned } = createStubCanvas();
    const people = normalizePeople([{ generation: 0, ...person }]);
    const layout = drawFamilyTree(canvas, people, DEFAULT_COLORS, extra.images ?? null);
    return { calls, assigned, layout };
  };

  it("男性は四角、女性は丸で示す", () => {
    const male = draw({ id: 1, name: "男", gender: "male" });
    const female = draw({ id: 1, name: "女", gender: "female" });
    const unknown = draw({ id: 1, name: "未設定" });
    assert.ok(male.calls.some((call) => call.name === "rect"), "男性に rect が無い");
    assert.ok(female.calls.some((call) => call.name === "arc"), "女性に arc が無い");
    assert.ok(!unknown.calls.some((call) => call.name === "rect" || call.name === "arc"), "未設定に記号が出ている");
  });

  it("故人は地色を変える", () => {
    const alive = draw({ id: 1, name: "存命", years: "1948-" });
    const dead = draw({ id: 1, name: "故人", years: "1888-1962" });
    assert.ok(alive.assigned.fillStyle.includes("#f2f9f7"), alive.assigned.fillStyle.join(","));
    assert.ok(dead.assigned.fillStyle.includes("#eceeed"), dead.assigned.fillStyle.join(","));
  });

  it("生没年が無い故人には「故人」と書く", () => {
    const { calls } = draw({ id: 1, name: "名前だけ", deceased: true });
    const texts = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    assert.ok(texts.includes("故人"), texts.join(","));
  });

  it("備考があれば枠に書く", () => {
    const { calls } = draw({ id: 1, name: "備考あり", memo: "東京在住" });
    const texts = calls.filter((call) => call.name === "fillText").map((call) => call.args[0]);
    assert.ok(texts.includes("東京在住"), texts.join(","));
  });

  it("写真は読み込み済みの画像があるときだけ描く", () => {
    const person = { id: 1, name: "写真あり", photo: "data:image/png;base64,ab" };
    const withoutImage = draw(person);
    assert.ok(!withoutImage.calls.some((call) => call.name === "drawImage"), "画像が無いのに描いている");

    const image = { width: 160, height: 120 };
    const withImage = draw(person, { images: new Map([[1, image]]) });
    const drawn = withImage.calls.find((call) => call.name === "drawImage");
    assert.ok(drawn, "写真を描いていない");
    assert.equal(drawn.args[0], image);
  });

  it("縦横比を保ったまま円に収める", () => {
    const image = { width: 200, height: 100 };
    const { calls } = draw(
      { id: 1, name: "横長", photo: "data:image/png;base64,ab" },
      { images: new Map([[1, image]]) }
    );
    const [, , , width, height] = calls.find((call) => call.name === "drawImage").args;
    assert.ok(Math.abs(width / height - 2) < 1e-6, `${width} x ${height}`);
  });
});
