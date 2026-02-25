---
title: "AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムを作った話"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "bedrock", "slack", "cloudflare", "marp"]
published: false
---

# はじめに

みなさん、AWS What's Newを追いかけていますか？

AWSは毎日のように新機能やアップデートを発表しており、その数は年間で数百件にのぼります。RSSフィードやメールで通知を受け取っていても、量が多すぎて読み切れない、どれが自分たちに関係あるのか判断するだけで時間がかかる、という経験をした方は多いのではないでしょうか。

そこで今回、**AWS What's Newを生成AIで自動要約し、ボタン一つでMarpスライドを生成、さらにそれをWebサイトとして公開する**というシステムを作ってみました。

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
[Bedrock Agent: 外部検索 + Marpスライド生成]
        ↓
[Cloudflare R2: スライドファイル保存]
[Cloudflare KV: メタデータ保存]
        ↓
[Cloudflare Workers: スライドサイト配信]
```

大きく3つのフェーズに分かれています。

## フェーズ1: 要約 → Slack通知

EventBridgeで定期的にLambdaを起動し、AWS What's NewのRSSフィードから最新の更新情報を取得します。取得した内容をAmazon Bedrockで要約し、ポイントをまとめた上でSlackに投稿します。この際、**「スライドを作成する」ボタン**をメッセージに添付します。

## フェーズ2: AIエージェントによるMarpスライド生成

Slackのボタンを押すと、Slack BoltがインタラクションをキャッチしてBedrock Agentを呼び出します。エージェントは要約内容に加えて外部検索ツールを活用し、より詳細な情報を収集した上でMarp形式のスライドを生成します。

## フェーズ3: Cloudflareでのホスティング

生成されたスライドはCloudflare R2に保存されます。Cloudflare KVにはスライドのタイトル・日付などのメタデータを管理し、Cloudflare Workersが一覧ページと個別スライドページを配信する仕組みです。


# 使った技術スタック

## AWSサービス

| サービス | 用途 |
|---|---|
| Amazon EventBridge | 定期実行のスケジューリング |
| AWS Lambda | RSS取得・要約処理・Slackへの投稿 |
| Amazon Bedrock (Claude Haiku 4.5) | What's Newの要約、Marpスライド生成エージェント |
| Amazon Bedrock Agent | 外部検索ツールを組み合わせたスライド生成 |
| AWS Systems Manager Parameter Store | Slack Token等のシークレット管理 |

## Cloudflare

| サービス | 用途 |
|---|---|
| Cloudflare Workers | スライドサイトのAPI・フロントエンド配信 |
| Cloudflare R2 | Marpスライドファイル（HTML）の保存 |
| Cloudflare KV | スライドのメタデータ管理（一覧表示用） |

## その他

| ツール・サービス | 用途 |
|---|---|
| Slack Bolt | ボタンインタラクションの処理 |
| Marp | MarkdownからHTMLスライドを生成 |
| Tavily | Bedrockエージェントの検索ツール |


# 完成イメージ

Slackに届く通知はこのような形になります。

- 更新タイトル
- 3〜5行の要約
- 関連サービスタグ
- 「スライドを作成する」ボタン

ボタンを押すとしばらくして、Cloudflare上にホストされたスライドのURLがSlackに返ってきます。そのURLにアクセスすると、What's Newの内容をまとめたMarpスライドが表示される、という体験を目指しました。

実際に動いているサイトはこちらです。

https://whatsnew-marp.nnydtmg.com/


# 各パートの詳細

詳細は以下の各記事をご参照ください。

- **Part1**: AWS What's NewをBedrockで要約してSlackに投稿し、ボタンでエージェントを呼び出す
- **Part2**: BedrockエージェントとMarpで自動スライド生成する
- **Part3**: Cloudflare Workers / KV / R2でスライドサイトをホスティングする


# 作ってみて感じたこと

生成AIを「要約するだけ」の用途に使うのではなく、**Slackのボタン制御でエージェントを起動する**という流れを組み込むことで、「読む」から「使う」に変わる体験が作れました。

また、Cloudflare Workers / KV / R2の組み合わせは、サーバーレスでありながら柔軟な構成が取れるため、スライドのホスティング基盤として非常に相性が良かったです。コスト面でも個人・チームの利用規模では十分無料枠内に収まります。

What's Newを追いかけるという業務的なユースケースで生成AIをどう活用するか、という観点でも参考になれば幸いです。

各パートで詳しく解説していきますので、興味のある部分からご覧ください！
