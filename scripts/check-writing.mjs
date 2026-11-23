#!/usr/bin/env node
// 記事の日本語を機械的にチェックする。
// ルールの中身は .claude/writing/style-rules.md、語彙リストは .claude/writing/ng-words.json。
//
// 使い方:
//   node scripts/check-writing.mjs articles/foo.md [more.md ...]
//   node scripts/check-writing.mjs --min=should articles/foo.md   # info を表示しない
//   node scripts/check-writing.mjs --strict articles/foo.md       # must があれば exit 1
//
// 行末に <!-- writing-check-ignore --> を付けた行はチェックしない。
// フロントマター、コードブロック、インラインコード、URL は語彙チェックの対象外。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LEVELS = { info: 0, should: 1, must: 2 };
const LABEL = { must: "MUST FIX", should: "Nice-to-have", info: "Nitpicking" };
const IGNORE = "writing-check-ignore";
const MAX_SENTENCE = 100;
const MAX_PARAGRAPH = 300;

const args = process.argv.slice(2);
const strict = args.includes("--strict");
const minArg = args.find((a) => a.startsWith("--min="));
const minLevel = LEVELS[minArg ? minArg.slice(6) : "info"] ?? 0;
const files = args.filter((a) => !a.startsWith("--"));

if (files.length === 0) {
  console.error("usage: node scripts/check-writing.mjs [--min=info|should|must] [--strict] <file.md>...");
  process.exit(2);
}

const { rules } = JSON.parse(readFileSync(join(ROOT, ".claude/writing/ng-words.json"), "utf8"));
const compiled = rules.map((r) => ({ ...r, re: new RegExp(r.pattern, "gu") }));

// 本文から語彙チェックの対象外にする部分を、位置を保ったまま空白に置き換える
function maskInline(line) {
  return line
    .replace(/`[^`]*`/g, (m) => " ".repeat(m.length))
    .replace(/https?:\/\/[^\s)>\]]+/g, (m) => " ".repeat(m.length))
    .replace(/<!--.*?-->/g, (m) => " ".repeat(m.length));
}

const EXAMPLE_IP = [/^192\.0\.2\./, /^198\.51\.100\./, /^203\.0\.113\./, /^10\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^127\./, /^0\.0\.0\.0$/, /^169\.254\./, /^255\./];

function checkFile(path) {
  const findings = [];
  const add = (line, col, level, id, text, reason, suggest) => {
    if (LEVELS[level] >= minLevel) findings.push({ line, col, level, id, text, reason, suggest });
  };

  const lines = readFileSync(path, "utf8").split("\n");
  let inFront = lines[0]?.trim() === "---";
  let fence = null;
  let para = []; // { no, text }

  const flushParagraph = () => {
    if (para.length === 0) return;
    const text = para.map((p) => p.text.trim()).join("");
    const plain = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[*_`]/g, "");
    if (plain.length > MAX_PARAGRAPH) {
      add(para[0].no, 1, "info", "long-paragraph", `${plain.length}字`,
        `段落が ${MAX_PARAGRAPH} 字を超えている`, "話題の切れ目で段落を分ける");
    }
    for (const s of plain.split(/(?<=[。！？!?])/)) {
      if (s.trim().length > MAX_SENTENCE) {
        const hit = para.find((p) => p.text.includes(s.trim().slice(0, 10))) ?? para[0];
        const start = Math.max(0, hit.text.indexOf(s.trim().slice(0, 10)));
        add(hit.no, start + 1, "info", "long-sentence", hit.orig.slice(start, start + 30).trim() + "…",
          `一文が ${MAX_SENTENCE} 字を超えている（${s.trim().length}字）`,
          "「〜ですが」「〜ので」「〜し」「〜ため」で文を切る");
      }
    }
    const bold = (text.match(/\*\*[^*]+\*\*/g) || []).length;
    if (bold >= 3) {
      add(para[0].no, 1, "info", "bold-overuse", `太字 ${bold} 個`,
        "1 段落に太字が多く、どこが重要か分からない", "拾い読みに必要な箇所だけ太字にする");
    }
    para = [];
  };

  lines.forEach((raw, i) => {
    const no = i + 1;
    if (inFront) {
      if (i > 0 && raw.trim() === "---") inFront = false;
      return;
    }
    // 開始フェンスの文字と長さを覚え、同じ文字で同じ長さ以上の行だけを終了とみなす
    const fenceMatch = raw.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length
        && raw.trim() === fenceMatch[1]) fence = null;
      checkIp(raw, no, add);
      return;
    }
    if (fenceMatch) {
      flushParagraph();
      fence = fenceMatch[1];
      return;
    }
    if (raw.includes(IGNORE)) {
      flushParagraph();
      return;
    }

    // 引用ブロックは他者の原文なので表現のチェック対象外（style-rules.md / japanese-check.md の方針）
    if (/^\s*>/.test(raw)) {
      flushParagraph();
      return;
    }
    // 表のセルが「—」だけのもの（該当なしの意味）は文中のダッシュとして扱わない
    const line = maskInline(raw).replace(/\|(\s*)(——|—)(\s*)(?=\|)/g, (m) => " ".repeat(m.length));
    // 「- [リンク](url) — 説明」「- **ラベル** — 説明」のようなリストの区切りは、文中のダッシュより軽く扱う
    const labelDash = /^\s*([-*+]|\d+\.) +(\[[^\]]*\]\([^)]*\)|\*\*[^*]+\*\*|`[^`]+`)\s*(——|—)/.exec(raw);
    for (const r of compiled) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(line)) !== null) {
        if (r.id === "dash" && labelDash && m.index === labelDash[0].length - labelDash[3].length) {
          add(no, m.index + 1, "info", "dash-label", m[0], "リスト項目の区切りのダッシュ",
            "「：」で区切るか、説明を文にする（参考資料リストなら無視してよい）");
          continue;
        }
        add(no, m.index + 1, r.level, r.id, m[0], r.reason, r.suggest);
      }
    }
    const naka = line.match(/[^\s・、。（）()「」]+・[^\s・、。（）()「」]+・[^\s・、。（）()「」]+/u);
    if (naka) {
      add(no, naka.index + 1, "info", "nakaguro", naka[0],
        "並列をナカグロで書くと箇条書きにしたときに崩れる", "読点（、）か箇条書きにする（固有の表記なら無視してよい）");
    }
    checkIp(raw, no, add);

    // 段落の区切り判定（見出し、リスト、表、Zenn 記法、画像、空行は段落に含めない）
    const t = raw.trim();
    if (t === "" || /^(#|[-*+] |\d+\. |\||:::|!\[|>|<)/.test(t)) {
      flushParagraph();
    } else {
      para.push({ no, text: line, orig: raw });
    }
  });
  flushParagraph();
  return findings;
}

function checkIp(raw, no, add) {
  if (raw.includes(IGNORE)) return;
  const re = /(?<![\d.])(\d{1,3}(?:\.\d{1,3}){3})(?![\d.])/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const ip = m[1];
    if (ip.split(".").some((o) => Number(o) > 255)) continue;
    if (EXAMPLE_IP.some((p) => p.test(ip))) continue;
    add(no, m.index + 1, "info", "example-ip", ip,
      "例示用でもプライベートでもない IP アドレス", "192.0.2.0/24 などの例示用アドレスを使う（実在の値を載せる意図なら無視してよい）");
  }
}

let mustCount = 0;
let total = 0;
for (const file of files) {
  const findings = checkFile(file).sort((a, b) => a.line - b.line || a.col - b.col);
  total += findings.length;
  mustCount += findings.filter((f) => f.level === "must").length;
  if (findings.length === 0) {
    console.log(`${file}: 指摘なし`);
    continue;
  }
  console.log(`\n## ${file}（${findings.length} 件）`);
  for (const f of findings) {
    console.log(`${file}:${f.line}:${f.col} [${LABEL[f.level]}] ${f.id} 「${f.text}」 ${f.reason} → ${f.suggest}`);
  }
}
console.log(`\n合計 ${total} 件（MUST FIX ${mustCount} 件）`);
process.exit(strict && mustCount > 0 ? 1 : 0);
