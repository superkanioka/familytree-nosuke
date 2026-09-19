#!/usr/bin/env node
// src/ から index.html を生成する。依存パッケージはなし。
//
//   node build.mjs           index.html を書き出す
//   node build.mjs --check   index.html が src/ と一致するか確認する（CI・テスト用）
//
// 配布物は従来どおり index.html 1枚なので、生成結果はコミットしておく。
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// 読み込み順 = 依存順。import/export を取り除いて素直に連結する。
const MODULES = ["src/data.js", "src/layout.js", "src/draw.js", "src/app.js"];

const BANNER = "<!-- このファイルは build.mjs が生成します。編集は src/ 側で行い、node build.mjs を実行してください。 -->";

function stripModuleSyntax(source, file) {
  const stripped = source
    .replace(/^import\s+[^;]*;\n/gm, "")
    .replace(/^export\s+/gm, "");
  if (/^\s*(?:import|export)\b/m.test(stripped)) {
    throw new Error(`${file}: 取り除けない import/export が残っています（1行1文で書いてください）`);
  }
  return stripped.trim();
}

function indent(text, spaces) {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() ? pad + line : line))
    .join("\n");
}

async function bundleScript() {
  const parts = [];
  for (const file of MODULES) {
    const source = await readFile(join(root, file), "utf8");
    parts.push(`// ---- ${file} ----\n${stripModuleSyntax(source, file)}`);
  }
  const bundle = `"use strict";\n\n${parts.join("\n\n")}`;
  // 実行せずに構文だけ検査する。
  // eslint-disable-next-line no-new-func
  new Function(bundle);
  return bundle;
}

async function buildHtml() {
  const [template, styles, icons, script] = await Promise.all([
    readFile(join(root, "src/index.template.html"), "utf8"),
    readFile(join(root, "src/styles.css"), "utf8"),
    readFile(join(root, "src/icons.svg"), "utf8"),
    bundleScript()
  ]);

  const html = template
    .replace("<!doctype html>", () => `<!doctype html>\n${BANNER}`)
    .replace("{{styles}}", () => indent(styles.trimEnd(), 4))
    .replace("{{icons}}", () => indent(icons.trimEnd(), 2))
    .replace("{{script}}", () => indent(script, 4));

  const leftover = html.match(/\{\{\w+\}\}/);
  if (leftover) throw new Error(`未置換のプレースホルダがあります: ${leftover[0]}`);
  return html;
}

const target = join(root, "index.html");
const html = await buildHtml();

if (process.argv.includes("--check")) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== html) {
    console.error("build check failed: index.html が src/ と一致しません。node build.mjs を実行してください。");
    process.exit(1);
  }
  console.log("build check passed: index.html は src/ と一致しています");
} else {
  await writeFile(target, html);
  console.log(`built index.html (${html.length} bytes)`);
}
