---
title: "Cloudflare Workers×Honoでスライドサイトをホスティングする【3部作 Part3】"
emoji: "🌐"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare", "hono", "actions"]
published: true
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart3です。

システム全体の概要は以下のサマリ記事をご覧ください。

https://zenn.dev/nnydtmg/articles/aws-whatsnew-slide-site

Part1ではAWS What's NewをBedrockで要約してSlackに投稿するところを、Part2ではAgentCore上のStrands AgentsがMarpスライドを生成してGitHubにコミットするところを解説しました。

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


# アーキテクチャの設計思想

## 「書き込みはCI、読み取りはWorkers」の完全分離

このシステムの最大の特徴は、**データの更新経路とサービング経路を完全に分離**していることです。

```
[GitHub Actions]          [Cloudflare Workers]
     ↓ 書き込み専用              ↑ 読み取り専用
  KV: metadata:*          KV: kv.get(...)
  R2: thumbnail.png       R2: （URLを返すだけ）
  Git: slide.html         Git Raw: iframeで参照
```

WorkersはKVとR2を読み取るだけで、一切書き込みません。副作用がないため、Workers側のコードはステートレスに保たれています。スケールアウトや再デプロイ時も整合性を気にする必要がなく、障害の切り分けも「CIが壊れているか、Workersが壊れているか」の二択に絞られます。

## コスト構造

このシステムは主要コンポーネントをすべて無料枠に収めています。

| サービス | 無料枠 | 本システムの利用量 |
|---|---|---|
| GitHub Actions | 2,000分/月（publicリポジトリは無制限） | 毎時1回 × 数分 |
| Cloudflare Workers | 10万リクエスト/日 | PV依存 |
| Cloudflare KV | 読み取り10万回/日, 書き込み1,000回/日 | 書き込みはCIのみ |
| Cloudflare R2 | 10GB保存, 100万クラス-A ops/月 | サムネイル数百枚 |

唯一の費用はドメイン代（任意）のみです。新しいAWS What's Newが来るたびに自動でスライドが公開される仕組みを、実質ゼロコストで維持できます。


# 1. GitHub Actions: HTML生成・メタデータ更新

Part2のAgentがコミットした`slide.md`を定期的にHTMLへ変換し、Cloudflare KV / R2を更新するワークフローです。以下の5ステップで構成されています。

| ステップ | 処理 |
|---|---|
| HTML変換 | `slide.md` → `slide.html`（未変換ファイルのみ） |
| サムネイル生成 | `slide.md` → `thumbnail.png`（新規または更新時のみ） |
| メタデータ生成 | `generate-metadata.mjs`でKV投入用JSONを生成 |
| KV更新 | `wrangler kv key put`で全メタデータキーを更新 |
| R2アップロード | 新規サムネイルのみR2にアップロード |

:::details ワークフロー全文

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
:::

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
| `metadata:YYYY/MM` | 各月のスライド一覧（タイトル・URL・サムネイルURL等） |

**`wrangler kv key put` によるKV書き込み**

`Update Workers KV`ステップの核心は、JSONをstdinから流し込む一行です。

```bash
cat metadata-all.json | jq '."metadata:index"' | \
  wrangler kv key put "metadata:index" \
    --namespace-id=${{ secrets.KV_NAMESPACE_ID }} \
    --remote --path=/dev/stdin
```

`generate-metadata.mjs`が全キーをまとめた1つのJSONを出力するため、`jq`でキーごとに切り出してWranglerに渡します。`--path=/dev/stdin`でファイルを介さずパイプで直接投入できます。月別キー（`metadata:YYYY/MM`）は`jq`で動的にキー名を列挙して`while read`でループします。

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

なお、KVのValue文字数の制限は`25MB`なので、直近は問題ないと思っていますが、本来はもう少し適切にトップページ用、アーカイブ用などで分割する方が良いかなと思っています。

:::details スクリプト全文

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
:::

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
binding = "MARP_KV"
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

:::details ルート定義

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
:::

`Bindings`型はKV・R2・環境変数をまとめた型定義です。各ルートは独立したHonoインスタンスとしてモジュール化し、`app.route()`でマウントしています。

## lib/types.ts（型定義）

アプリ全体で使う型と、Workersのバインディング定義をまとめています。

:::details 型定義例

```typescript
/** 記事メタデータ */
export interface Article {
  id: string          // 形式: yyyy-mm-dd-title
  title: string
  date: string        // 形式: yyyy-mm-dd
  year: number
  month: number
  day: number
  path: string        // リポジトリ内の相対パス
  thumbnailUrl?: string
  summary?: string
  // 後方互換性のため
  slideUrl?: string
  summaryUrl?: string
}

/** 月別アーカイブ */
export interface MonthlyArchive {
  year: number
  month: number
  articles: Article[]
  totalPages: number
}

/** メタデータインデックス（metadata:index の値） */
export interface MetadataIndex {
  articles: Article[]
  updatedAt: string
}

/** Workers バインディング */
export interface Bindings {
  MARP_KV?: KVNamespace
  GITHUB_REPO: string
  GITHUB_BRANCH: string
  CACHE_TTL: number
  SYNC_SECRET?: string
  GA_MEASUREMENT_ID?: string
}

export type Env = Bindings
```
:::

`Bindings`にKV・GitHub連携用の変数・GA計測IDをまとめることで、`c.env.*`の型補完が全ルートで効きます。`MARP_KV`をオプショナル（`?`）にしているのは、wrangler.tomlのバインディング設定が不完全な環境でも型エラーを出さず、ルート層でnullチェックして適切なエラーを返すためです。

## routes/index.ts（トップページ）

KVから直近10件の記事と利用可能な月一覧を取得し、JSXテンプレートに渡してHTMLを返します。

:::details トップページの例

```typescript
import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { getRecentArticles, getAvailableMonths } from '../services/metadata'
import { IndexPage } from '../templates/index'

const indexRoute = new Hono<{ Bindings: Bindings }>()

indexRoute.get('/', async (c) => {
  const kv = c.env.MARP_KV
  const gaMeasurementId = c.env.GA_MEASUREMENT_ID
  if (!kv) {
    return c.text('KV namespace not configured', 500)
  }
  try {
    const articles = await getRecentArticles(kv, 10)
    const months = await getAvailableMonths(kv)
    c.header('Cache-Control', 'public, max-age=300')
    return c.html(
      <IndexPage articles={articles} months={months} gaMeasurementId={gaMeasurementId} />
    )
  } catch (error) {
    console.error('❌ Failed to load index page:', error)
    return c.text(
      `Failed to load index page: ${error instanceof Error ? error.message : String(error)}`,
      500
    )
  }
})

export default indexRoute
```
:::

ポイントは3つです。

**KVの取得**
`c.env.MARP_KV`からKVバインディングを取得します。未設定の場合は早期リターンで500を返し、後続処理でのnullアクセスを防いでいます。

**2つのKV読み取り**
`getRecentArticles`は`metadata:index`から記事リストの先頭10件を、`getAvailableMonths`は`metadata:months`から月一覧を取得します。どちらも`services/metadata`にまとめた薄いラッパーです。

**キャッシュヘッダー**
`Cache-Control: public, max-age=300`（5分）を付与します。Cloudflare CDNがエッジでキャッシュするため、KV読み取りコストとレイテンシを削減できます。

## routes/search.ts（検索）

`/search?q=keyword&page=N` のクエリパラメータを受け取り、KV上の全記事メタデータをWorkers内でフィルタリングして結果を返します。

:::details 検索結果表示ページ例

```typescript
import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { getAvailableMonths, searchArticles } from '../services/metadata'
import { SearchPage } from '../templates/search'

const searchRoute = new Hono<{ Bindings: Bindings }>()

searchRoute.get('/', async (c) => {
  const kv = c.env.MARP_KV
  const gaMeasurementId = c.env.GA_MEASUREMENT_ID
  if (!kv) {
    return c.text('KV namespace not configured', 500)
  }
  try {
    const query = c.req.query('q') || ''
    const pageStr = c.req.query('page') || '1'
    const page = Number.parseInt(pageStr, 10)
    if (Number.isNaN(page) || page < 1) {
      return c.text('Invalid page', 400)
    }
    const { articles, total, totalPages, currentPage } = await searchArticles(
      kv,
      query,
      page,
      20
    )
    const months = await getAvailableMonths(kv)
    c.header('Cache-Control', 'public, max-age=300')
    return c.html(
      <SearchPage
        query={query}
        articles={articles}
        months={months}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        gaMeasurementId={gaMeasurementId}
      />
    )
  } catch (error) {
    console.error('Failed to load search page:', error)
    return c.text('Failed to load search page', 500)
  }
})

export default searchRoute
```
:::

検索はシンプルな設計です。`searchArticles`が`metadata:index`から全記事を取得し、`title`・`summary`フィールドに対してキーワードの部分一致でフィルタリングします。記事数が数百件規模であればWorkers内のインメモリ検索で十分なレスポンスタイムに収まります。

ページネーションは1ページ20件固定で、`page`パラメータのバリデーション（NaN・1未満の拒否）をルート層で行い、サービス層には正常値のみを渡すようにしています。

## routes/archive.ts（月別アーカイブ）

`/archive/:year/:month` のパスパラメータで月を指定し、その月の記事一覧をページネーション付きで返します。

:::details アーカイブページ例

```typescript
import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { getMonthlyArticles, getAvailableMonths } from '../services/metadata'
import { ArchivePage } from '../templates/archive'

const archiveRoute = new Hono<{ Bindings: Bindings }>()

archiveRoute.get('/:year/:month', async (c) => {
  const kv = c.env.MARP_KV
  const gaMeasurementId = c.env.GA_MEASUREMENT_ID
  if (!kv) {
    return c.text('KV namespace not configured', 500)
  }
  try {
    const yearStr = c.req.param('year')
    const monthStr = c.req.param('month')
    const pageStr = c.req.query('page') || '1'
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStr, 10)
    const page = parseInt(pageStr, 10)

    if (isNaN(year) || isNaN(month) || isNaN(page)) {
      return c.text('Invalid parameters', 400)
    }
    if (month < 1 || month > 12) {
      return c.text('Invalid month', 400)
    }
    if (page < 1) {
      return c.text('Invalid page', 400)
    }

    const monthlyArchive = await getMonthlyArticles(kv, year, month, page)
    const months = await getAvailableMonths(kv)

    c.header('Cache-Control', 'public, max-age=300')
    return c.html(
      <ArchivePage
        year={year}
        month={month}
        articles={monthlyArchive.articles}
        months={months}
        currentPage={page}
        totalPages={monthlyArchive.totalPages}
        gaMeasurementId={gaMeasurementId}
      />
    )
  } catch (error) {
    console.error('Failed to load archive page:', error)
    return c.text('Failed to load archive page', 500)
  }
})

export default archiveRoute
```
:::

`getMonthlyArticles`は`metadata:2026/02`のように月別KVキーを直接読み取ります。`metadata:index`（全件）を使わず月別キーに分割しているのは、1リクエストあたりのKV読み取りサイズを抑えるためです。

バリデーションは3段階で、数値変換失敗（NaN）→月の範囲（1〜12）→ページ下限（1以上）の順で弾きます。3つのパラメータをまとめてチェックしてから個別の範囲チェックに進む構成です。

## services/metadata.ts（KVアクセス層）

ルートから呼ばれるKV読み取りロジックをまとめたサービス層です。

:::details コード例

```typescript
import type { Article, MonthlyArchive, MetadataIndex, Bindings } from '../lib/types'

/** 全記事メタデータを取得 */
export async function getAllArticles(kv: KVNamespace): Promise<Article[]> {
  const indexData = await kv.get<MetadataIndex>('metadata:index', 'json')
  if (!indexData) {
    console.warn('⚠️ metadata:index not found in KV, returning empty array')
    return []
  }
  return indexData.articles
}

/** 月別記事を取得（ページング対応） */
export async function getMonthlyArticles(
  kv: KVNamespace,
  year: number,
  month: number,
  page: number = 1,
  perPage: number = 10
): Promise<MonthlyArchive> {
  const monthKey = `metadata:${year}/${month.toString().padStart(2, '0')}`
  const monthData = await kv.get<MonthlyArchive>(monthKey, 'json')

  const allArticles = monthData
    ? monthData.articles
    : (await getAllArticles(kv)).filter(a => a.year === year && a.month === month)

  const totalPages = Math.ceil(allArticles.length / perPage)
  const startIndex = (page - 1) * perPage
  return {
    year: monthData?.year ?? year,
    month: monthData?.month ?? month,
    articles: allArticles.slice(startIndex, startIndex + perPage),
    totalPages,
  }
}

/** 利用可能な月一覧を取得 */
export async function getAvailableMonths(kv: KVNamespace): Promise<string[]> {
  const months = await kv.get<string[]>('metadata:months', 'json')
  if (months) return months

  const allArticles = await getAllArticles(kv)
  const monthSet = new Set<string>()
  allArticles.forEach(article => {
    monthSet.add(`${article.year}/${article.month.toString().padStart(2, '0')}`)
  })
  return Array.from(monthSet).sort((a, b) => b.localeCompare(a))
}

/** 直近N件の記事を取得 */
export async function getRecentArticles(
  kv: KVNamespace,
  limit: number = 10
): Promise<Article[]> {
  const allArticles = await getAllArticles(kv)
  return allArticles
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
}

/** 検索（タイトル + サマリのAND検索） */
export async function searchArticles(
  kv: KVNamespace,
  query: string,
  page: number = 1,
  perPage: number = 20
): Promise<{ articles: Article[]; total: number; totalPages: number; currentPage: number }> {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return { articles: [], total: 0, totalPages: 0, currentPage: 1 }
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean)
  const allArticles = await getAllArticles(kv)

  const matched = allArticles
    .filter(article => {
      const haystack = `${article.title ?? ''} ${article.summary ?? ''}`.toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const total = matched.length
  const totalPages = total === 0 ? 0 : Math.ceil(total / perPage)
  const safePage = Math.min(Math.max(page, 1), totalPages || 1)
  return {
    articles: matched.slice((safePage - 1) * perPage, safePage * perPage),
    total,
    totalPages,
    currentPage: safePage,
  }
}
```
:::

### 設計のポイント

**2段階フォールバック**
`getMonthlyArticles`と`getAvailableMonths`はそれぞれ専用KVキー（`metadata:YYYY/MM`・`metadata:months`）を先に読みに行き、存在しなければ`metadata:index`全件から生成します。KVデータが最新でない状態でも動作するため、初回デプロイ時やKV更新の遅延にも対応できます。

**スペース区切りAND検索**
`searchArticles`ではクエリをスペースで分割し、全単語が`title + summary`に含まれる場合のみマッチとします（`terms.every`）。「EC2 インスタンス」のように複数ワードで絞り込めます。

**`safePage`によるページクランプ**
`Math.min(Math.max(page, 1), totalPages || 1)`で、URLに大きすぎるページ番号が渡されても最終ページに丸めます。ルート層のバリデーション（1未満拒否）とサービス層のクランプで2重に範囲を保証しています。

## templates/components/article-card.tsx（カードコンポーネント）

記事一覧グリッドの1枚を担うコンポーネントです。サムネイル有無でフォールバック表示を切り替えています。

:::details カード表示のUI例

```tsx
export const ArticleCard: FC<ArticleCardProps> = ({ article }) => {
  // ...
  return (
    <a href={`/article/${article.id}`}
      class="block bg-white rounded-lg shadow-md hover:shadow-xl transition-shadow ...">
      {/* サムネイル or グラデーションプレースホルダー */}
      <div class="w-full aspect-video rounded-md mb-4 overflow-hidden bg-gray-100">
        {article.thumbnailUrl ? (
          <img src={article.thumbnailUrl} alt={...} class="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div class="bg-gradient-to-br from-blue-500 to-blue-700 ...">
            <svg ...>...</svg>  {/* ドキュメントアイコン */}
          </div>
        )}
      </div>
      <h3 class="text-lg font-bold line-clamp-2">{article.title}</h3>
      <p><time datetime={article.date}>{formatDate(article.date)}</time></p>
    </a>
  )
}
```
:::

HonoのJSXはReactと異なり、HTML属性をそのまま使います（`class`・`stroke-linecap`など）。`aspect-video`で16:9の比率を固定しカードの高さを統一しています。サムネイルが未生成の場合はグラデーション＋SVGアイコンのプレースホルダーを表示し、R2へのアップロードが完了次第自動で画像に切り替わります。

## スライド配信フロー（Marp HTML + iframe）

記事詳細ページ（`/article/:id`）のスライド表示は、WorkersがHTMLを生成するのではなく、**GitHubにコミット済みの`slide.html`をiframeで参照する**設計です。

```
[ブラウザ]
  │  GET /article/2026-02-25-amazon-ec2-...
  ▼
[Cloudflare Workers]
  │  KVから article.path を取得
  │  GitHub Raw URL を組み立て
  │    → https://raw.githubusercontent.com/{repo}/{branch}/{path}/slide.html
  ▼
[レスポンスHTML]
  <iframe src="https://raw.githubusercontent.com/..." />
```

Workers側では`article.path`（例: `2026/02/25/amazon-ec2-...`）をKVから読み取り、GitHubのraw URLを構築してiframeの`src`に埋め込むだけです。`slide.html`の実体はGitHubが配信するため、**Workersは一切ファイルを保持しません**。

```typescript
// routes/article.ts（抜粋）
const slideUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${env.GITHUB_BRANCH}/${article.path}/slide.html`
return c.html(<ArticlePage article={article} slideUrl={slideUrl} />)

// テンプレート側
<iframe src={slideUrl} class="w-full h-full" />
```

Marpが生成した`slide.html`はスタンドアローンのHTMLファイル（CSS・JS込み）なので、iframeで読み込むだけでスライドがそのまま動作します。iframeはfetch/XHRと異なりCORSの制限を受けないため、GitHub Raw URLをそのまま参照して表示できます。


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


# おわりに

Part3ではGitHubにコミットされたMarpスライドをCloudflareのエッジで配信するまでを構築しました。このパートの設計判断と、3部作全体を振り返ります。

**CI（書き込み）とWorkers（読み取り）の完全分離**
このシステム最大の特徴は、データの更新経路とサービング経路を完全に切り離した点です。WorkersはKVとR2を読むだけで一切書き込まず、副作用がありません。GitHub ActionsがCIとして全データを管理し、Workersはステートレスなレンダリング層に徹することで、スケールと障害の切り分けが容易になっています。

**KVキー設計で読み取りサイズを分散**
`metadata:index`（全件）・`metadata:months`（月一覧）・`metadata:YYYY/MM`（月別）の3種類に分割することで、1リクエストが読み取るデータ量を最小化しています。全件を毎回読まずに済むため、月別アーカイブページの表示コストがスライド数の増加に比例しません。

**iframeでスライドを配信し、Workersにファイルを持たない**
`slide.html`はMarpがスタンドアローンHTMLとして生成するため、GitHubのraw URLをiframeで参照するだけでスライドが動作します。WorkersはURLを組み立てて返すだけで、ファイルの取得・変換・保持を一切行いません。

**Workers内インメモリ検索で外部サービス不要**
`metadata:index`の全記事をメモリ上でフィルタリングする方式は、数百件規模では十分なレスポンスタイムに収まります。Elasticsearch等の検索サービスを追加することなく、AND検索とページネーションを実装できています。

**実質ゼロコスト運用**
GitHub Actions（publicリポジトリ無制限）・Cloudflare Workers（10万req/日無料）・KV（読み取り10万回/日無料）・R2（10GB無料）の組み合わせにより、ドメイン代以外のコストはほぼ発生しません。

これにて３部作は完結ですが、気になるパートだけでも参考にしていただけると幸いです。
そして、サイトの方にもアクセスいただいて、気になるポイントがあればコメントいただけると嬉しいです！

https://whatsnew-marp.nnydtmg.com/
