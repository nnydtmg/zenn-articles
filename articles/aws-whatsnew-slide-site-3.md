---
title: "Cloudflare Workers×Honoでスライドサイトをホスティングする【3部作 Part3】"
emoji: "🌐"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare", "hono", "cloudflareworkers", "cloudflarer2", "cloudflare"]
published: false
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart3です。

システム全体の概要は以下のサマリ記事をご覧ください。

<!-- TODO: サマリ記事のURLを追加 -->

Part1ではAWS What's NewをBedrockで要約してSlackに投稿するところを、Part2ではAgentCore上のStrands AgentがMarpスライドを生成してGitHubにコミットするところを解説しました。

このPart3では、**GitHubにコミットされたMarpスライドをCloudflare Workers / KV / R2を使ってWebサイトとして配信するまで**を解説します。

## このPartで扱う範囲

```
[GitHub: slide.md / summary.md がコミット済み] ← Part2より
        ↓ (GitHub Actions: Marp → HTML変換)
[GitHub Pages: slide.html]
        ↓ (Cloudflare Workers からの参照)
[Cloudflare KV: メタデータ管理]
    ├── title, date, url, thumbnail_url
[Cloudflare R2: サムネイル画像]
        ↓
[Cloudflare Workers (Hono)]
    ├── GET / → スライド一覧ページ
    └── GET /:year/:month/:day/:title → 個別スライドページ
```


# 構成

## 使用するサービス

| サービス/ライブラリ | 役割 |
|---|---|
| **Cloudflare Workers** | サーバーレスなエッジランタイム |
| **Hono** | Workers上のWebフレームワーク |
| **Cloudflare KV** | スライドのメタデータ（タイトル・日付・URL等）の管理 |
| **Cloudflare R2** | スライドのサムネイル画像の保存 |
| **GitHub Actions** | MarpのMarkdownをHTMLに変換して保存 |
| **GitHub Pages / Raw** | 変換済みHTMLの配信元 |

## ディレクトリ構成

```
workers/
├── src/
│   ├── index.ts          # エントリーポイント（Honoルーティング）
│   ├── kv.ts             # KV操作ユーティリティ
│   └── r2.ts             # R2操作ユーティリティ
├── wrangler.toml         # Cloudflareデプロイ設定
└── package.json
```


# 1. GitHub Actions: HTML生成・メタデータ更新

Part2のAgentがコミットした`slide.md`を定期的にHTMLへ変換し、Cloudflare KV / R2を更新するワークフローです。以下の5ステップで構成されています。

| ステップ | 処理 |
|---|---|
| HTML変換 | `slide.md` → `slide.html`（未変換ファイルのみ） |
| サムネイル生成 | `slide.md` → `thumbnail.png`（新規または更新時のみ） |
| メタデータ生成 | `generate-metadata.mjs`でKV投入用JSONを生成 |
| KV更新 | `wrangler kv key put`で全メタデータキーを更新 |
| R2アップロード | 新規サムネイルのみR2にアップロード |

## ワークフロー全文

```yaml
name: Generate HTML and Update Metadata

on:
  schedule:
    - cron: '0 * * * *'   # 毎時実行
  workflow_dispatch:       # 手動実行を許可

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      # Marp/Puppeteerの日本語レンダリングに必要
      - name: Install Japanese fonts
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y fonts-noto-cjk
          fc-cache -fv

      - name: Install Marp CLI
        run: npm install -g @marp-team/marp-cli

      # slide.html が存在しない slide.md のみ変換
      - name: Generate slide.html from slide.md
        run: |
          converted_count=0
          skipped_count=0
          failed_count=0

          mapfile -d '' files < <(find . -type f -name "slide.md" -print0)
          for file in "${files[@]}"; do
            dir=$(dirname "$file")
            html_file="$dir/slide.html"
            if [ ! -f "$html_file" ]; then
              echo "  ✓ Converting $file..."
              if marp --html --allow-local-files --theme ./themes/aws-whatsnew.css "$file" -o "$html_file" < /dev/null; then
                converted_count=$((converted_count + 1))
              else
                echo "  ✗ Failed to convert $file"
                failed_count=$((failed_count + 1))
              fi
            else
              skipped_count=$((skipped_count + 1))
            fi
          done

          echo "=== Conversion Summary ==="
          echo "Converted: $converted_count / Skipped: $skipped_count / Failed: $failed_count"

      # サムネイルは新規または slide.md 更新時のみ再生成
      - name: Generate thumbnails from slide.md
        run: |
          set +e
          generated_count=0
          skipped_count=0
          newly_generated_list="/tmp/new_thumbnails.txt"
          : > "$newly_generated_list"

          mapfile -d '' files < <(find . -type f -name "slide.md" -print0)
          for file in "${files[@]}"; do
            dir=$(dirname "$file")
            # summary.md と slide.html の両方が存在する場合のみ処理
            [ -f "$dir/summary.md" ] && [ -f "$dir/slide.html" ] || continue

            if [ -f "$dir/thumbnail.png" ]; then
              # slide.md がサムネイルより新しければ再生成
              slide_time=$(git log -1 --format="%at" -- "$file")
              thumb_time=$(git log -1 --format="%at" -- "$dir/thumbnail.png")
              if [ -n "$slide_time" ] && [ -n "$thumb_time" ] && [ "$slide_time" -le "$thumb_time" ]; then
                skipped_count=$((skipped_count + 1))
                continue
              fi
              rm "$dir/thumbnail.png"
            fi

            if marp --image png --allow-local-files --theme ./themes/aws-whatsnew.css "$file" -o "$dir/thumbnail.png" < /dev/null; then
              generated_count=$((generated_count + 1))
              echo "$dir/thumbnail.png" >> "$newly_generated_list"
            fi
          done

          echo "=== Thumbnail Summary ==="
          echo "Generated: $generated_count / Skipped: $skipped_count"

      # generate-metadata.mjs で全KVキー分のJSONを一括生成
      - name: Generate metadata
        env:
          THUMBNAIL_BASE_URL: ${{ secrets.THUMBNAIL_BASE_URL }}
        run: |
          node .github/scripts/generate-metadata.mjs . all > metadata-all.json
          echo "Generated metadata for $(cat metadata-all.json | jq -r '."metadata:index".totalCount') articles"

      # metadata:index, metadata:months, metadata:{year}-{month} をKVに投入
      - name: Update Workers KV
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          npm install -g wrangler

          for key in "metadata:index" "metadata:months"; do
            cat metadata-all.json | jq ".\"$key\"" | \
              wrangler kv key put "$key" \
                --namespace-id=${{ secrets.KV_NAMESPACE_ID }} \
                --remote --path=/dev/stdin
          done

          # 月別キー（metadata:YYYY-MM）を動的に更新
          cat metadata-all.json | jq -r 'keys[] | select(startswith("metadata:") and . != "metadata:index" and . != "metadata:months")' | \
          while read key; do
            echo "Updating $key..."
            cat metadata-all.json | jq ".\"$key\"" | \
              wrangler kv key put "$key" \
                --namespace-id=${{ secrets.KV_NAMESPACE_ID }} \
                --remote --path=/dev/stdin
          done

      # 新規サムネイルのみR2にアップロード
      - name: Upload thumbnails to R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          R2_BUCKET: ${{ secrets.R2_BUCKET }}
        run: |
          newly_generated_list="/tmp/new_thumbnails.txt"
          [ -s "$newly_generated_list" ] || { echo "No new thumbnails."; exit 0; }

          while read file; do
            [ -z "$file" ] && continue
            key=${file#./}   # 先頭の "./" を除去して R2 キーにする
            echo "Uploading $file → $key"
            wrangler r2 object put "$R2_BUCKET/$key" --remote --file "$file"
          done < "$newly_generated_list"

      # [skip ci] でワークフローの無限ループを防ぐ
      - name: Commit generated files
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add "**/slide.html" metadata-all.json
          git add "**/thumbnail.png" || true
          git diff --quiet && git diff --staged --quiet || \
            git commit -m "Generate HTML and metadata [skip ci]"
          git push
```

## 設計のポイント

**冪等な差分更新**
- HTML変換: `slide.html`が既に存在する場合はスキップ
- サムネイル: Gitのコミット時刻を比較し、`slide.md`が新しい場合のみ再生成
- R2アップロード: `/tmp/new_thumbnails.txt`に記録した新規ファイルのみ対象

**KVのキー構造**
ワークフローが更新する KV キーは3種類です。

| キー | 内容 |
|---|---|
| `metadata:index` | 全スライドの件数・最新日付などの集計情報 |
| `metadata:months` | 月一覧（ナビゲーション用） |
| `metadata:YYYY-MM` | 各月のスライド一覧（タイトル・URL・サムネイルURL等） |

**必要なSecretsの設定**

| Secret | 用途 |
|---|---|
| `THUMBNAIL_BASE_URL` | R2のパブリックURL（例: `https://pub-xxx.r2.dev`） |
| `CLOUDFLARE_API_TOKEN` | Wrangler用APIトークン |
| `CLOUDFLARE_ACCOUNT_ID` | CloudflareアカウントID |
| `KV_NAMESPACE_ID` | KVネームスペースID |
| `R2_BUCKET` | R2バケット名 |


# 2. メタデータ生成スクリプト（generate-metadata.mjs）

ワークフローの `Generate metadata` ステップから呼ばれる`.github/scripts/generate-metadata.mjs`が、リポジトリ内のディレクトリを走査して全KVキー分のJSONを一括生成します。

## 処理の流れ

```
yyyy/mm/dd/title/
├── slide.html   ← <h1>タグからタイトルを抽出
└── summary.md   ← 最初の段落をサマリとして抽出
```

両ファイルが揃ったディレクトリのみを記事として認識し、月別にグルーピングして出力します。

## 出力フォーマット

引数 `outputFormat` によって出力を切り替えます。ワークフローでは `all` を使用して全KVキーをまとめた1つのJSONを生成します。

| フォーマット | 内容 |
|---|---|
| `index` | `metadata:index`のみ（全記事リスト） |
| `months` | 月一覧の配列のみ |
| `monthly` | 月別データを順に出力 |
| `all` | 全KVキーをまとめたオブジェクト（ワークフロー用） |

`all`モードの出力例:

```json
{
  "metadata:index": {
    "articles": [...],
    "updatedAt": "2026-02-25T10:00:00Z",
    "totalCount": 123
  },
  "metadata:months": ["2026/02", "2026/01", "2025/12"],
  "metadata:2026/02": {
    "year": 2026,
    "month": 2,
    "articles": [...],
    "totalPages": 3
  }
}
```

## スクリプト全文

```javascript
#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

/** HTMLファイルの<h1>タグからタイトルを抽出 */
function extractTitleFromHtml(htmlPath) {
  try {
    const content = fs.readFileSync(htmlPath, 'utf-8');
    const match = content.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (match && match[1]) {
      return match[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
        .trim();
    }
  } catch (error) {
    console.error(`Failed to extract title from ${htmlPath}:`, error.message);
  }
  return null;
}

/** ディレクトリ名からタイトルを生成（フォールバック） */
function titleFromDirectory(dirname) {
  return dirname.replace(/-/g, ' ').replace(/\b\w/g, char => char.toUpperCase());
}

/** summary.md の最初の段落をサマリとして抽出（最大240文字） */
function extractSummaryFromMarkdown(summaryPath, maxLength = 240) {
  try {
    const content = fs.readFileSync(summaryPath, 'utf-8');
    const firstBlock = content
      .replace(/\r\n/g, '\n')
      .split(/\n\s*\n/)
      .map(block => block.trim())
      .find(block => block.length > 0) || '';
    const cleaned = firstBlock
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`[^`]*`/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_~\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned || null;
  } catch (error) {
    console.error(`Failed to extract summary from ${summaryPath}:`, error.message);
    return null;
  }
}

/** yyyy/mm/dd/title/ 構造をスキャンして記事メタデータを収集 */
function scanArticles(baseDir = '.') {
  const articles = [];
  const thumbnailBaseUrl = process.env.THUMBNAIL_BASE_URL
    ? process.env.THUMBNAIL_BASE_URL.replace(/\/+$/, '')
    : null;

  const yearDirs = fs.readdirSync(baseDir)
    .filter(name => /^\d{4}$/.test(name) && fs.statSync(path.join(baseDir, name)).isDirectory())
    .sort((a, b) => b.localeCompare(a));

  for (const yearDir of yearDirs) {
    const yearPath = path.join(baseDir, yearDir);
    const monthDirs = fs.readdirSync(yearPath)
      .filter(name => /^\d{2}$/.test(name) && fs.statSync(path.join(yearPath, name)).isDirectory())
      .sort((a, b) => b.localeCompare(a));

    for (const monthDir of monthDirs) {
      const monthPath = path.join(yearPath, monthDir);
      const dayDirs = fs.readdirSync(monthPath)
        .filter(name => /^\d{2}$/.test(name) && fs.statSync(path.join(monthPath, name)).isDirectory())
        .sort((a, b) => b.localeCompare(a));

      for (const dayDir of dayDirs) {
        const dayPath = path.join(monthPath, dayDir);
        const titleDirs = fs.readdirSync(dayPath)
          .filter(name => fs.statSync(path.join(dayPath, name)).isDirectory());

        for (const titleDir of titleDirs) {
          const articlePath = path.join(dayPath, titleDir);
          const slideHtml = path.join(articlePath, 'slide.html');
          const summaryMd = path.join(articlePath, 'summary.md');

          // slide.html と summary.md が揃っている場合のみ記事として認識
          if (fs.existsSync(slideHtml) && fs.existsSync(summaryMd)) {
            const title = extractTitleFromHtml(slideHtml) || titleFromDirectory(titleDir);
            const summary = extractSummaryFromMarkdown(summaryMd);
            const relativePath = path.relative(baseDir, articlePath).replace(/\\/g, '/');
            articles.push({
              id: `${yearDir}-${monthDir}-${dayDir}-${titleDir}`,
              title,
              date: `${yearDir}-${monthDir}-${dayDir}`,
              year: parseInt(yearDir, 10),
              month: parseInt(monthDir, 10),
              day: parseInt(dayDir, 10),
              path: relativePath,
              summary,
              thumbnailUrl: thumbnailBaseUrl
                ? `${thumbnailBaseUrl}/${relativePath}/thumbnail.png`
                : undefined
            });
          }
        }
      }
    }
  }
  return articles;
}

function groupByMonth(articles) {
  const grouped = {};
  for (const article of articles) {
    const monthKey = `${article.year}/${String(article.month).padStart(2, '0')}`;
    if (!grouped[monthKey]) grouped[monthKey] = { year: article.year, month: article.month, articles: [] };
    grouped[monthKey].articles.push(article);
  }
  return grouped;
}

function main() {
  const baseDir = process.argv[2] || '.';
  const outputFormat = process.argv[3] || 'index';
  const articles = scanArticles(baseDir);
  articles.sort((a, b) => b.date.localeCompare(a.date));
  const updatedAt = new Date().toISOString();

  if (outputFormat === 'all') {
    const monthlyGroups = groupByMonth(articles);
    const months = Object.keys(monthlyGroups).sort((a, b) => b.localeCompare(a));
    const output = {
      'metadata:index': { articles, updatedAt, totalCount: articles.length },
      'metadata:months': months
    };
    for (const [monthKey, data] of Object.entries(monthlyGroups)) {
      output[`metadata:${monthKey}`] = {
        year: data.year, month: data.month,
        articles: data.articles,
        totalPages: Math.ceil(data.articles.length / 10)
      };
    }
    console.log(JSON.stringify(output, null, 2));
  } else if (outputFormat === 'months') {
    const months = Object.keys(groupByMonth(articles)).sort((a, b) => b.localeCompare(a));
    console.log(JSON.stringify(months, null, 2));
  } else {
    console.log(JSON.stringify({ articles, updatedAt, totalCount: articles.length }, null, 2));
  }
}

main();
```

## 設計のポイント

**タイトルの2段階抽出**
`slide.html`の`<h1>`タグを正規表現で取得し、失敗した場合はディレクトリ名をキャメルケースに変換してフォールバックします。

**サマリの抽出**
`summary.md`の最初の段落を取得し、コードブロック・Markdownマーカー・リンク記法を除去してプレーンテキスト化します。検索・一覧表示用に最大240文字に制限しています。

**サムネイルURL**
`THUMBNAIL_BASE_URL`環境変数（R2のパブリックURL）とパスを結合して生成します。環境変数が未設定の場合は`thumbnailUrl`フィールド自体を省略します。


# 3. Cloudflare R2: サムネイル画像

R2はパブリックバケットとして設定し、`thumbnail.png`を`{year}/{month}/{day}/{title}/thumbnail.png`というパスで格納します。Workers側はこのURLをKVのメタデータから読み取り、一覧ページのサムネイル表示に使います。

<!-- TODO: R2バケット設定の詳細を追加 -->


# 4. Hono + Cloudflare Workers アプリ

## wrangler.toml

```toml
name = "whatsnew-marp"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "SLIDES_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

[[r2_buckets]]
binding = "THUMBNAILS_R2"
bucket_name = "whatsnew-thumbnails"
```

## アプリ構成

ルーティングをファイルに分割し、`index.tsx`でまとめて登録します。

| ルート | ファイル | 役割 |
|---|---|---|
| `/` | `routes/index` | トップページ（最新10件） |
| `/article` | `routes/article` | 記事詳細（スライド表示） |
| `/archive` | `routes/archive` | 月別アーカイブ |
| `/search` | `routes/search` | 検索・検索結果 |
| `/api` | `routes/api` | JSON API |

## index.tsx

```typescript
import { Hono } from 'hono'
import type { Bindings } from './lib/types'
import indexRoute from './routes/index'
import articleRoute from './routes/article'
import archiveRoute from './routes/archive'
import searchRoute from './routes/search'
import apiRoute from './routes/api'
import { handleError, handleNotFound } from './routes/errors'

const app = new Hono<{ Bindings: Bindings }>()

app.route('/', indexRoute)
app.route('/article', articleRoute)
app.route('/archive', archiveRoute)
app.route('/search', searchRoute)
app.route('/api', apiRoute)

app.notFound((c) => handleNotFound(c))
app.onError((err, c) => handleError(err, c))

export default app
```

`Bindings`型はKV・R2・環境変数をまとめた型定義です。各ルートは独立したHonoインスタンスとしてモジュール化し、`app.route()`でマウントしています。


# 5. デプロイ

```bash
# 依存関係のインストール
npm install

# ローカル開発
npx wrangler dev

# 本番デプロイ
npx wrangler deploy
```

<!-- TODO: デプロイ手順の詳細を追加 -->


# まとめ

<!-- TODO: まとめを追加 -->
