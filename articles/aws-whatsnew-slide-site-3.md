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

ワークフローから呼ばれる`.github/scripts/generate-metadata.mjs`が、リポジトリ内の`slide.md`を走査して全KVキーをまとめたJSONを生成します。

<!-- TODO: generate-metadata.mjsのコードを追加 -->


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

<!-- TODO: Honoアプリ本体のコードを追加 -->


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
