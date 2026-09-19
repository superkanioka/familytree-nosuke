// Storage-failure checks: localStorage is made to throw before the app boots,
// mimicking a full quota or a browser that blocks site data.
(async () => {
  const out = [];
  const ok = (name, cond, extra = "") => out.push(`${cond ? "PASS" : "FAIL"} ${name}${cond ? "" : " -- " + extra}`);
  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  try {
    ok("起動時に警告が出る", $("status").textContent.includes("保存できません"), $("status").textContent);
    ok("警告はエラー配色", $("snackbar").classList.contains("is-error"));
    ok("それでもアプリは使える", $("treeCanvas").width > 0 && document.querySelectorAll(".person-row").length > 0);

    $("newBtn").click();
    $("name").value = "保存できないテスト";
    $("generation").value = "0";
    $("saveBtn").click();
    await wait(10);
    ok("保存失敗を知らせる", $("status").textContent.includes("保存できませんでした"), $("status").textContent);
    await wait(4500);
    ok("警告は消えずに残る", !$("snackbar").hidden && $("status").textContent.includes("保存できませんでした"), $("status").textContent);
  } catch (error) {
    out.push(`FAIL 例外が出た -- ${error && error.message}`);
  }

  document.title = "done";
  document.body.insertAdjacentHTML("afterbegin", `<pre id="testout">${out.join("\n")}</pre>`);
})();
