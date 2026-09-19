// Browser behaviour checks for index.html.
// Injected into a temporary copy of the page by tests/browser.sh and run headless.
(async () => {
  const out = [];
  const ok = (name, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " -- " + extra}`);
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const dialog = $("confirmDialog");
  const count = () => JSON.parse($("jsonEditor").value).length;
  const waitFor = async (predicate, timeout = 1000) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await wait(10);
    }
    return predicate();
  };
  // Wait for the confirmation dialog, press one of its buttons, and wait for it
  // to close. Returns false when the dialog never opened.
  const press = async (id) => {
    if (!(await waitFor(() => dialog.open))) return false;
    $(id).click();
    await waitFor(() => !dialog.open);
    await wait(20);
    return true;
  };

  // Canvas上の人物枠の中心を、画面座標に直してクリックする。
  // buildLayout はページ側のスクリプトが持つ関数をそのまま使う。
  function selectPersonOnCanvas(canvas, rect, person) {
    const layout = buildLayout(JSON.parse(document.getElementById("jsonEditor").value), canvas.width, canvas.height);
    const pos = layout.positions.get(person.id);
    const x = rect.left + (pos.x / canvas.width) * rect.width;
    const y = rect.top + (pos.y / canvas.height) * rect.height;
    canvas.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y, pointerId: 1 }));
  }

  try {
    const start = count();

    // --- Material 3 chrome is wired up ---
    const manual = $("manualLayoutBtn");
    manual.click();
    ok("配置調整: ラベルだけが入れ替わる", manual.querySelector(".btn-label").textContent === "配置調整を終了");
    ok("配置調整: アイコンが残る", !!manual.querySelector("svg use"));
    ok("配置調整: aria-pressed", manual.getAttribute("aria-pressed") === "true");
    ok("配置調整: 用紙に is-manual", document.querySelector(".paper").classList.contains("is-manual"));
    manual.click();
    ok("配置調整: ラベルが戻る", manual.querySelector(".btn-label").textContent === "配置調整");

    document.querySelector(".person-row button").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    ok("リップルが出る", !!document.querySelector(".ripple"));

    // --- 新規追加はIDを自分で採番し、既存の人物を書き換えない ---
    $("newBtn").click();
    $("name").value = "新規テスト";
    $("generation").value = "0";
    $("saveBtn").click();
    await wait(20);
    ok("新規追加できる", count() === start + 1 && $("jsonEditor").value.includes("新規テスト"), String(count()));
    const added = JSON.parse($("jsonEditor").value).find((item) => item.name === "新規テスト");
    ok("IDは自動で採番される", Number.isInteger(added?.id) && added.id > 0, JSON.stringify(added?.id));
    ok("既存の人物は無事", JSON.parse($("jsonEditor").value).filter((item) => item.id === 1).length === 1);
    ok("ID入力欄は無い", !$("personId"));

    // --- 氏名が空なら項目ごとにエラーを出す ---
    $("newBtn").click();
    $("name").value = "   ";
    $("saveBtn").click();
    await wait(20);
    ok("氏名なしでは保存しない", count() === start + 1, String(count()));
    ok("氏名欄にエラーが出る", !$("nameError").hidden && $("nameError").textContent.includes("氏名"), $("nameError").textContent);
    ok("氏名欄が不正表示になる", $("name").classList.contains("is-invalid"));
    $("name").value = "エラー解消テスト";
    $("saveBtn").click();
    await wait(20);
    ok("直せば保存できる", count() === start + 2, String(count()));
    ok("エラー表示が消える", $("nameError").hidden && !$("name").classList.contains("is-invalid"));

    // --- 親は一覧から選び、世代は自動で決まる ---
    $("newBtn").click();
    $("name").value = "子テスト";
    $("addParentBtn").click();
    ok("親ピッカーが開く", await waitFor(() => $("pickerDialog").open));
    const parentRow = $("pickerList").querySelector(".picker-row");
    const parentName = parentRow.querySelector(".picker-name").textContent;
    parentRow.click();
    await waitFor(() => !$("pickerDialog").open);
    await wait(20);
    ok("親が関係リストに入る", $("parentList").querySelectorAll(".relation-row").length === 1);
    ok("親は名前で表示される", $("parentList").querySelector(".relation-name").textContent === parentName, parentName);
    const parentGeneration = JSON.parse($("jsonEditor").value).find((item) => item.name === parentName).generation;
    ok("世代が親+1になる", Number($("generation").value) === parentGeneration + 1, $("generation").value);

    // --- 検索で候補を絞り込める ---
    $("addSpouseBtn").click();
    await waitFor(() => $("pickerDialog").open);
    const allRows = $("pickerList").querySelectorAll(".picker-row").length;
    const candidateName = $("pickerList").querySelector(".picker-name").textContent;
    $("pickerSearch").value = candidateName;
    $("pickerSearch").dispatchEvent(new Event("input", { bubbles: true }));
    await wait(10);
    const filtered = $("pickerList").querySelectorAll(".picker-row").length;
    ok("検索で候補が絞られる", filtered > 0 && filtered < allRows, `${filtered}/${allRows} (${candidateName})`);
    ok("既に親にした人物は候補から外れる", ![...$("pickerList").querySelectorAll(".picker-name")].some((el) => el.textContent === parentName));
    $("pickerCancelBtn").click();
    await waitFor(() => !$("pickerDialog").open);
    ok("キャンセルすれば増えない", $("spouseList").querySelectorAll(".relation-row").length === 0);

    // --- 配偶者は相手側にも登録される ---
    $("addSpouseBtn").click();
    await waitFor(() => $("pickerDialog").open);
    const spouseRow = $("pickerList").querySelector(".picker-row");
    const spouseName = spouseRow.querySelector(".picker-name").textContent;
    spouseRow.click();
    await waitFor(() => !$("pickerDialog").open);
    $("spouseList").querySelector("select").value = "divorced";
    $("spouseList").querySelector("select").dispatchEvent(new Event("change", { bubbles: true }));
    $("saveBtn").click();
    await wait(20);
    const saved = JSON.parse($("jsonEditor").value);
    const child = saved.find((item) => item.name === "子テスト");
    const spouse = saved.find((item) => item.name === spouseName);
    ok("配偶者が保存される", child.spouseIds.includes(spouse.id));
    ok("相手側にもリンクが張られる", spouse.spouseIds.includes(child.id));
    ok("関係の種別も相手側に伝わる", spouse.spouseRelationshipTypes[String(child.id)] === "divorced", JSON.stringify(spouse.spouseRelationshipTypes));

    // --- 関係は外せる ---
    $("parentList").querySelector(".icon-button").click();
    await wait(10);
    ok("親を外せる", $("parentList").querySelectorAll(".relation-row").length === 0);

    // --- 一覧はIDではなく名前で関係を示す ---
    const meta = document.querySelector(".person-row .person-meta").textContent;
    ok("一覧に世代が出る", meta.includes("世代"), meta);
    ok("一覧にIDを出さない", !meta.includes("配偶者:-") && !/配偶者: ?\d+/.test(meta), meta);

    // --- Canvasの人物をクリックすると編集対象になる ---
    const canvas = $("treeCanvas");
    const rect = canvas.getBoundingClientRect();
    const target = JSON.parse($("jsonEditor").value)[0];
    selectPersonOnCanvas(canvas, rect, target);
    await wait(20);
    ok("Canvasクリックで人物を選べる", $("name").value === target.name, `${$("name").value} / ${target.name}`);

    // --- Undo / Redo ---
    const beforeUndo = count();
    $("newBtn").click();
    $("name").value = "取り消しテスト";
    $("generation").value = "0";
    $("saveBtn").click();
    await wait(20);
    ok("追加でUndoボタンが有効になる", !$("undoActionBtn").disabled);
    $("undoActionBtn").click();
    await wait(20);
    ok("Undoで追加が取り消される", count() === beforeUndo && !$("jsonEditor").value.includes("取り消しテスト"), String(count()));
    ok("Redoボタンが有効になる", !$("redoActionBtn").disabled);
    $("redoActionBtn").click();
    await wait(20);
    ok("Redoでやり直せる", $("jsonEditor").value.includes("取り消しテスト"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    await wait(20);
    ok("Ctrl+Zでも戻せる", !$("jsonEditor").value.includes("取り消しテスト"));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true, bubbles: true }));
    await wait(20);
    ok("Ctrl+Shift+Zでやり直せる", $("jsonEditor").value.includes("取り消しテスト"));
    $("undoActionBtn").click();
    await wait(20);

    // --- 一覧から選ぶとその場で更新される ---
    document.querySelector(".person-row button").click();
    await wait(10);
    ok("編集で行が選択される", document.querySelectorAll(".person-row.is-selected").length === 1);
    const selected = JSON.parse($("jsonEditor").value).find((item) => item.name === $("name").value).id;
    const beforeRename = count();
    $("name").value = "改名テスト";
    $("saveBtn").click();
    await wait(20);
    ok("その場で更新される", JSON.parse($("jsonEditor").value).find((item) => item.id === selected)?.name === "改名テスト");
    ok("行が増えない", count() === beforeRename, String(count()));

    // --- delete asks first; cancelling changes nothing ---
    const before = count();
    $("deleteBtn").click();
    ok("削除は確認ダイアログを開く", await press("confirmCancelBtn"));
    ok("キャンセルで消えない", count() === before, String(count()));

    // --- confirming deletes, and undo brings the person back ---
    $("deleteBtn").click();
    await press("confirmOkBtn");
    ok("確認すると削除される", count() === before - 1, String(count()));
    const afterDelete = JSON.parse($("jsonEditor").value);
    ok("参照も外れる", !afterDelete.some((item) => item.parentIds.includes(selected) || item.spouseIds.includes(selected)));
    ok("元に戻すが出る", !$("undoBtn").hidden);
    $("undoBtn").click();
    await wait(20);
    ok("元に戻すで復活する", count() === before && JSON.parse($("jsonEditor").value).some((item) => item.id === selected), String(count()));
    ok("元に戻すは一度だけ", $("undoBtn").hidden);

    // --- the dialog can be reused ---
    $("deleteBtn").click();
    await press("confirmOkBtn");
    ok("2回目の削除も動く", count() === before - 1, String(count()));
    $("undoBtn").click();
    await wait(20);

    // --- deleting with nothing selected is refused ---
    $("newBtn").click();
    $("deleteBtn").click();
    await wait(20);
    ok("未選択なら削除しない", !dialog.open && $("status").textContent.includes("選ばれていません"), $("status").textContent);

    // --- double clicking a destructive button must not break the dialog ---
    document.querySelector(".person-row button").click();
    const beforeDouble = count();
    $("deleteBtn").click();
    $("deleteBtn").click();
    ok("二重クリックでも確認は1回", await press("confirmCancelBtn"));
    ok("二重クリック後もダイアログは閉じる", !dialog.open);
    ok("二重クリックで消えない", count() === beforeDouble, String(count()));
    $("deleteBtn").click();
    ok("その後も削除できる", await press("confirmOkBtn"));
    ok("削除が反映される", count() === beforeDouble - 1, String(count()));
    $("undoBtn").click();
    await wait(20);
    ok("戻せる", count() === beforeDouble, String(count()));

    // --- sample restore asks first and is undoable ---
    $("sampleBtn").click();
    ok("サンプル復元も確認する", await press("confirmCancelBtn"));
    ok("キャンセルでデータが残る", $("jsonEditor").value.includes("改名テスト"));
    $("sampleBtn").click();
    await press("confirmOkBtn");
    ok("サンプル復元が効く", !$("jsonEditor").value.includes("改名テスト"));
    ok("サンプル復元も元に戻せる", !$("undoBtn").hidden);
    $("undoBtn").click();
    await wait(20);
    ok("元に戻すとデータが戻る", $("jsonEditor").value.includes("改名テスト"));

    // --- automatic backups ---
    const backups = JSON.parse(localStorage.getItem("familytree.backups") || "[]");
    ok("バックアップが保存される", backups.length > 0, String(backups.length));
    ok("バックアップは5件まで", backups.length <= 5, String(backups.length));
    ok("バックアップ欄が出る", !$("backupBox").hidden);
    const restoreBtn = $("backupList").querySelector("button");
    ok("バックアップ行が並ぶ", !!restoreBtn);
    if (restoreBtn) {
      restoreBtn.click();
      await press("confirmOkBtn");
      ok("バックアップから復元できる", $("status").textContent.includes("バックアップから復元"), $("status").textContent);
    }

    // --- broken JSON reports and keeps the stored data ---
    const keep = count();
    $("jsonEditor").value = "{ broken";
    $("applyJsonBtn").click();
    await wait(10);
    ok("壊れたJSONを知らせる", $("status").textContent.includes("JSONエラー"), $("status").textContent);
    ok("壊れたJSONでデータを失わない", JSON.parse(localStorage.getItem("familytree.people")).length === keep);

    // --- the sheet still renders ---
    ok("Canvasが描画される", $("treeCanvas").width > 0 && $("treeCanvas").height > 0);
  } catch (error) {
    out.push(`FAIL 例外が出た -- ${error && error.message}`);
  }

  document.title = "done";
  document.body.insertAdjacentHTML("afterbegin", `<pre id="testout">${out.join("\n")}</pre>`);
})();
