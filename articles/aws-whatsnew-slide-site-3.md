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


# 1. GitHub Actions: Marpスライド→HTML変換

Part2のAgentがコミットした`slide.md`をGitHub Actionsで自動的にHTMLに変換します。

```yaml
# .github/workflows/marp.yml
name: Marp to HTML

on:
  push:
    paths:
      - '**/*.md'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Convert Marp to HTML
        uses: docker://marpteam/marp-cli:latest
        with:
          entrypoint: marp
          args: --html --output ${{ env.OUTPUT }} ${{ env.INPUT }}
        env:
          INPUT:  ${{ github.event.head_commit.modified[0] }}
          OUTPUT: ${{ github.event.head_commit.modified[0] }}

      - name: Commit HTML
        run: |
          git config user.name "github-actions"
          git config user.email "github-actions@github.com"
          git add '**/*.html'
          git commit -m "Convert Marp to HTML" || echo "No changes"
          git push
```

<!-- TODO: 実際のワークフローファイルの内容を追加 -->


# 2. Cloudflare KV: メタデータ管理

## KVのデータ構造

KVには各スライドのメタデータをJSON形式で保存します。

```
Key:   "slides:index"               → 全スライドのIDリスト（配列）
Key:   "slides:{year}/{month}/{day}/{title}"
Value: {
  "title": "Amazon Bedrock が Claude 4.5 をサポート",
  "category": "AI/ML",
  "published_date": "2026-02-25",
  "article_url": "https://aws.amazon.com/...",
  "slide_url": "https://raw.githubusercontent.com/...",
  "thumbnail_url": "https://pub-xxx.r2.dev/...",
  "summary": "..."
}
```

<!-- TODO: KV操作のコードを追加 -->


# 3. Cloudflare R2: サムネイル画像

スライドのサムネイル（OGP画像）をR2に保存します。Part2のAgentがコミット後にサムネイルを生成・アップロードするか、Workers側でスライドURLから動的に生成する方法が考えられます。

<!-- TODO: R2アップロードのコードを追加 -->


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
