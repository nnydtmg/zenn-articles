---
title: AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムを作った話
private: false
tags:
  - aws
  - bedrock
  - slack
  - cloudflare
  - marp
updated_at: '2026-02-26T17:03:27+09:00'
id: bda50315d56712693167
organization_url_name: null
slide: false
---

# はじめに

みなさん、AWS What's Newを追いかけていますか？

AWSは毎日のように新機能やアップデートを発表しており、その数は年間で数百件にのぼります。RSSフィードやメールで通知を受け取っていても、量が多すぎて読み切れない、どれが自分たちに関係あるのか判断するだけで時間がかかる、という経験をした方は多いのではないでしょうか。

私自身普段からSlackに通知は飛ばしているものの、なかなか読み込む時間が取れないため、よりサクッと概要を把握できる状態にしたいと思い、今回Webサイトを作成しました。

流れとしては、

* AWS What's Newを生成AIで自動要約し
* 気になった記事をボタン一つでMarpスライドにし
* さらにそれをWebサイトとして公開する

というシステムを作ってみました。

このシリーズでは、以下の3つのパートに分けて実装の詳細を紹介していきます。このサマリ記事では全体像と技術スタックを俯瞰します。

| 記事 | 内容 |
|---|---|
| Part1 | AWS What's NewをBedrockで要約 → Slack投稿 → ボタンでエージェント起動 |
| Part2 | BedrockエージェントがMarpスライドを自動生成する |
| Part3 | Cloudflare Workers / KV / R2でスライドサイトをホスティングする |


# システム全体像

まず全体のフローを図で示します。

```
[EventBridge (定期実行)]
        ↓
[Lambda: RSS取得 + Bedrock要約]
        ↓
[Slack: 要約メッセージ + ボタン投稿]
        ↓ (ボタンクリック)
[Slack Bolt: インタラクションハンドラ]
        ↓
[Bedrock AgentCore: Tavily検索 + Marpスライド生成 + GitHubにコミット]
        ↓
[GitHub Actions: MarpスライドをHTMLでエクスポート・保存]
[Cloudflare R2: サムネイル画像の保存]
[Cloudflare KV: URL等のメタデータ保存]
        ↓
[Cloudflare Workers: KVからメタデータ取得 → GitHubのHTMLを配信]
```

大きく3つのフェーズに分かれています。

## フェーズ1: 要約 → Slack通知

EventBridgeで定期的にLambdaを起動し、AWS What's NewのRSSフィードから最新の更新情報を取得します。取得した内容をAmazon Bedrockで要約し、ポイントをまとめた上でSlackに投稿します。この際、**「スライドを作成する」ボタン**をメッセージに添付します。

## フェーズ2: AIエージェントによるMarpスライド生成

Slackのボタンを押すと、Slack BoltがインタラクションをキャッチしてBedrock AgentCoreを呼び出します。エージェントは要約内容に加えて外部検索ツールを活用し、より詳細な情報を収集した上でMarp形式のスライドを生成します。

## フェーズ3: Cloudflareでのホスティング

生成されたMarpスライドはHTMLとしてエクスポートされ、GitHubに保存されます。Cloudflare KVにはスライドのURL・タイトル・日付などのメタデータを管理し、Cloudflare Workers上のHonoアプリがKVからメタデータを取得し、GitHubのHTMLを参照する形で一覧ページと個別スライドページを配信します。

## 全体構成イメージ

今回のアーキテクチャの概要です。

![](https://raw.githubusercontent.com/nnydtmg/zenn-articles/main/images/aws-whatsnew-slide-site/00_arch.png)

# 使った技術スタック

## AWSサービス

| サービス | 用途 |
|---|---|
| Amazon EventBridge | 定期実行のスケジューリング |
| AWS Lambda | RSS取得・要約処理・Slackへの投稿 |
| Amazon Bedrock (Claude Haiku 4.5) | What's Newの要約、Marpスライド生成エージェント |
| Amazon Bedrock AgentCore | 外部検索ツールを組み合わせたスライド生成 |
| AWS Systems Manager Parameter Store | Slack Token等のシークレット管理 |

## Cloudflare

| サービス | 用途 |
|---|---|
| Cloudflare Workers | KVからメタデータ取得・スライドサイト配信 |
| Cloudflare KV | スライドのURL・タイトル等のメタデータ管理 |
| Cloudflare R2 | スライドのサムネイル画像の保存 |

## その他

| ツール・サービス | 用途 |
|---|---|
| Strands Agents (Python) | AIエージェントを構築するフレームワーク |
| Slack Bolt | ボタンインタラクションの処理 |
| Marp | MarkdownからHTMLスライドを生成 |
| Tavily | 検索APIサービス。AIエージェントで追加検索を行う際に利用 |
| GitHub | MarpのHTMLスライドファイルのホスティング |
| Hono | Cloudflare Workers上のWebフレームワーク |


# 完成イメージ

Slackに届く通知はこのような形になります。

- 更新タイトル
- 3〜5行の要約 + 詳細な内容(要約と詳細でメッセージを分割して長文メッセージを回避しています)
- 「スライドを作成する」ボタン

ボタンを押すとしばらくして、Cloudflare上にホストされたサイトにスライドが追加・表示される状態を目指しました。

文章の要約をSlackで読むだけでなく、スライド形式にすることでよりサクッと概要を掴みやすくしたい、というのがこの仕組みを作った個人的なモチベーションです。

実際に動いているサイトはこちらです。

https://whatsnew-marp.nnydtmg.com/


# 各パートの詳細

詳細は以下の各記事をご参照ください。

- **Part1**: AWS What's NewをBedrockで要約してSlackに投稿し、ボタンでエージェントを呼び出す
- **Part2**: BedrockエージェントとMarpで自動スライド生成する
- **Part3**: Cloudflare Workers / KV / R2でスライドサイトをホスティングする


# 作ってみて感じたこと

普段からWhat's Newを追ってはいるのですが、よりサクッと確認したいという個人的なニーズを簡単に形にできたので、やってみて良かったと思っています。

基本的なコード作成やトラブルシュートにはもちろんClaudeCode(sonnet4.5-4.6)を利用しており、デザインなどは雰囲気を伝えるだけでできてしまうので、使ったもん勝ちな世の中になってきていると感じました。

また、Cloudflare Workers / KV / R2の組み合わせは、サーバーレスでありながら柔軟な構成が取れるため、スライドのホスティング基盤として非常に相性が良かったです。コスト面でも個人・チームの利用規模では十分無料枠内に収まります。

各パートで詳しく解説していきますので、興味のある部分からご覧ください！

### Part1

https://zenn.dev/nnydtmg/articles/aws-whatsnew-slide-site-1

### Part2

https://zenn.dev/nnydtmg/articles/aws-whatsnew-slide-site-2

### part3

https://zenn.dev/nnydtmg/articles/aws-whatsnew-slide-site-3
