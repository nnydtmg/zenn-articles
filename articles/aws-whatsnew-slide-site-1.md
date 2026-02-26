---
title: "AWS What's NewをBedrockで要約してSlackに投稿する【3部作 Part1】"
emoji: "📰"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "bedrock", "lambda", "slack"]
published: false
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart1です。

システム全体の概要は以下のサマリ記事をご覧ください。

<!-- TODO: サマリ記事のURLを追加 -->

このPart1では、**AWS What's NewのRSSフィードをLambdaで定期取得し、Amazon Bedrockで要約してSlackに投稿するまで**を解説します。また、Slackのボタンインタラクションを受け取ってBedrock AgentCoreを呼び出す部分も含みます。

:::message
RSS取得・Bedrock要約・Slack通知の基本的な構成は、AWS Samplesとして公開されている **[whats-new-summary-notifier](https://github.com/aws-samples/whats-new-summary-notifier)** を参考にしています。同プロジェクトはCDKでのデプロイに対応しており、SlackとMicrosoft Teams両方に対応しています。本記事ではスライド生成のためのBedrock AgentCore連携を追加した拡張構成を紹介します。
:::

## このPartで扱う範囲

```
[EventBridge (定期実行)]
        ↓
[Lambda: RSS取得 + Bedrock要約]
        ↓
[Slack: 要約メッセージ + ボタン投稿]
        ↓ (ボタンクリック)
[Slack Bolt: インタラクションハンドラ]
        ↓
[Bedrock Agent呼び出し] ← Part2へ続く
```


# 構成

## AWS構成

- **Amazon EventBridge**: 定期実行のスケジューリング
- **AWS Lambda**: RSS取得・Bedrock要約・Slack投稿
- **Amazon Bedrock (Claude Haiku 4.5)**: What's Newの要約生成
- **Amazon DynamoDB**: 処理済みエントリの管理（重複処理防止）
- **AWS Systems Manager Parameter Store**: Slack Token等のシークレット管理

## Slack構成

- **Slack App (Bolt)**: ボタンインタラクションのハンドリング
- **Block Kit**: ボタン付きメッセージの構築


# 実装

## 1. EventBridgeの設定

Lambdaを定期実行するためにEventBridgeのスケジュールルールを作成します。
AWS What's NewのRSSフィードは頻繁に更新されるため、毎時間程度の実行が現実的です。今回は1時間ごとに実行するよう設定しています。

```json
{
  "ScheduleExpression": "rate(1 hour)",
  "State": "ENABLED",
  "Targets": [
    {
      "Id": "WhatsnewSummaryLambda",
      "Arn": "<Lambda ARN>"
    }
  ]
}
```

## 2. Parameter Storeの準備

LambdaからSlackへの投稿に必要なTokenをParameter Storeに登録します。

| パラメータ名 | 内容 |
|---|---|
| `/whatsnew/slack_bot_token` | Slack Bot Token (`xoxb-...`) |
| `/whatsnew/slack_channel_id` | 投稿先チャンネルID |
| `/whatsnew/slack_signing_secret` | Slack Signing Secret（Bolt用） |

## 3. Lambda: RSS取得 + Bedrock要約 + Slack投稿

メインとなるLambda関数の実装です。

### RSSフィードの取得

AWS What's NewのRSSフィードを取得し、DynamoDBで管理している処理済みエントリIDと照合することで新着エントリのみを抽出します。

:::message
[whats-new-summary-notifier](https://github.com/aws-samples/whats-new-summary-notifier) と同様に、DynamoDBでエントリIDを管理しています。時間ベースのフィルタと違い、Lambda実行タイミングのズレや再実行時の二重投稿を確実に防止できます。
:::

```python
import feedparser
import boto3

RSS_URL = "https://aws.amazon.com/about-aws/whats-new/recent/feed/"
TABLE_NAME = "whatsnew-processed-entries"

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def is_processed(entry_id: str) -> bool:
    response = table.get_item(Key={"entry_id": entry_id})
    return "Item" in response

def mark_as_processed(entry_id: str):
    table.put_item(Item={"entry_id": entry_id})

def get_new_entries():
    feed = feedparser.parse(RSS_URL)

    new_entries = []
    for entry in feed.entries:
        if not is_processed(entry.id):
            new_entries.append(entry)

    return new_entries
```

### Bedrockによる要約

取得したエントリのタイトルと概要をClaude Haiku 4.5に渡して要約します。

```python
import json

bedrock = boto3.client("bedrock-runtime", region_name="us-east-1")

def summarize(title: str, summary: str) -> str:
    prompt = f"""以下のAWS What's Newの内容を日本語で3〜5行に要約してください。
要約は箇条書きではなく、読みやすい文章でまとめてください。

タイトル: {title}
内容: {summary}
"""
    response = bedrock.invoke_model(
        modelId="us.anthropic.claude-haiku-4-5-20251001",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 512,
            "messages": [{"role": "user", "content": prompt}],
        }),
    )
    result = json.loads(response["body"].read())
    return result["content"][0]["text"]
```

### Slackへの投稿（ボタン付き）

要約した内容をBlock KitでSlackに投稿します。ボタンには後続処理で参照するために、エントリのURLを`value`として持たせます。

```python
from slack_sdk import WebClient

def post_to_slack(client: WebClient, channel: str, entry, summary: str):
    client.chat_postMessage(
        channel=channel,
        blocks=[
            {
                "type": "header",
                "text": {"type": "plain_text", "text": entry.title},
            },
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": summary},
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f"<{entry.link}|AWS公式ページ>",
                },
            },
            {
                "type": "actions",
                "elements": [
                    {
                        "type": "button",
                        "text": {"type": "plain_text", "text": "スライドを作成する"},
                        "style": "primary",
                        "action_id": "create_slide",
                        "value": entry.link,
                    }
                ],
            },
        ],
    )
```

### Lambdaハンドラ

```python
import os
import boto3

ssm = boto3.client("ssm")

def get_param(name: str) -> str:
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]

def handler(event, context):
    token = get_param("/whatsnew/slack_bot_token")
    channel = get_param("/whatsnew/slack_channel_id")
    client = WebClient(token=token)

    entries = get_new_entries()
    for entry in entries:
        summary = summarize(entry.title, entry.summary)
        post_to_slack(client, channel, entry, summary)
        mark_as_processed(entry.id)  # 投稿後にDynamoDBへ記録
```

## 4. Slack Bolt: ボタンインタラクションのハンドリング

Slackのボタンが押されたときのイベントを受け取るため、Slack Boltを使ったアプリを用意します。今回はLambda上でBoltを動かしています。

```python
from slack_bolt import App
from slack_bolt.adapter.aws_lambda import SlackRequestHandler

signing_secret = get_param("/whatsnew/slack_signing_secret")
token = get_param("/whatsnew/slack_bot_token")

app = App(token=token, signing_secret=signing_secret, process_before_response=True)

@app.action("create_slide")
def handle_create_slide(ack, body, say):
    ack()
    url = body["actions"][0]["value"]
    title = body["message"]["blocks"][0]["text"]["text"]

    say(f"スライドを生成中です... :hourglass_flowing_sand:\nタイトル: {title}")

    # Bedrock Agentを呼び出す（Part2で詳解）
    invoke_agent_runtime(title=title, url=url)

def lambda_handler(event, context):
    handler = SlackRequestHandler(app=app)
    return handler.handle(event, context)
```

`process_before_response=True` はLambdaのタイムアウト制約に対応するための設定です。Slackは3秒以内にレスポンスを要求するため、`ack()` を先に返してから非同期で処理を進めます。

## 5. Bedrock AgentCoreの呼び出し

ボタンのインタラクションを受けたら、スライド生成を担うBedrock AgentCoreを呼び出します。詳細はPart2で解説しますが、呼び出し部分のみここに示します。

```python
import boto3

bedrock_agentcore = boto3.client('bedrock-agentcore', region_name=AWS_REGION)

def invoke_agent_runtime(title: str, url: str):
    payload_dict = {
            'articleUrl': article_url,
            'channel': channel,
            'thread_ts': thread_ts
        }
    payload = json.dumps(payload_dict).encode('utf-8')
    response = bedrock_agentcore.invoke_agent_runtime(
        agentRuntimeArn="<AgentCore ARN>",
        payload=payload,
        sessionId=title[:30]  # セッションIDに記事タイトルの先頭を使用
    )
    # レスポンスのストリーム処理
    for event in response["completion"]:
        if "chunk" in event:
            print(event["chunk"]["bytes"].decode())
```


# Slackアプリの設定

Slackアプリ側で以下の設定が必要です。

## Interactivity & Shortcuts

ボタンのインタラクションを受け取るために、Request URLにLambdaのFunction URL（またはAPI Gateway URL）を設定します。

```
https://<your-lambda-url>/slack/events
```

## OAuth & Permissions

Botに以下のスコープを付与します。

| スコープ | 用途 |
|---|---|
| `chat:write` | メッセージ投稿 |
| `chat:write.public` | パブリックチャンネルへの投稿 |


# ポイントと注意点

## Slackの3秒ルール

Slackはボタンを押してから3秒以内にHTTP 200レスポンスを要求します。Bedrock AgentCoreの呼び出しはそれ以上かかるため、`ack()` を先に返してから非同期で処理を進める設計にしています。

Lambdaで非同期処理を行う場合は、Boltの `process_before_response=True` オプションを有効にした上で、別のLambdaを非同期invoke（`InvocationType="Event"`）するか、SQSを介す方法が安定します。

## RSSの重複取得防止

DynamoDBのテーブルに処理済みエントリのIDを記録することで、Lambda実行タイミングのズレや再実行時の二重投稿を防いでいます。テーブル設計はシンプルで、パーティションキーに `entry_id`（RSSエントリのID）のみを持たせています。

| 属性名 | 型 | 内容 |
|---|---|---|
| `entry_id` | String (PK) | RSSエントリのID |

古いエントリを自動削除したい場合は、TTL属性を追加して保持期間を設定することもできます。


# おわりに

Part1ではEventBridge → Lambda → Bedrock → Slackという一本のパイプラインを構築しました。このパートを振り返って、特に重要だった設計判断を整理します。

**イベント駆動で処理を疎結合に保つ**
RSSフィード取得・要約・Slack投稿をすべて1つのLambdaで完結させています。EventBridgeのスケジュール実行が唯一の起点で、それ以外に常時稼働するプロセスはありません。Lambda＋Bedrock従量課金のみのコスト構造で、記事が来ない日はほぼゼロ費用です。

**DynamoDBのPK一意制約でRSS重複取得を防ぐ**
「処理済みか否か」の判定を専用テーブルで管理することで、Lambdaの再実行や実行タイミングのズレによる二重投稿を防いでいます。複雑なロジックはなく、エントリIDをPKに書き込むだけの最小設計です。

**Slackの3秒ルールを`ack()`の先行返却で突破**
Bedrock AgentCoreの呼び出しは数十秒~数分かかることがあります。ボタンインタラクション受信後すぐに`ack()`でSlackに200を返し、処理は非同期で進める構成が必須でした。`process_before_response=True`とLambdaの非同期invokeを組み合わせることでこれを実現しています。

**ボタンがPart2への橋渡し**
Slackに投稿されたボタンを押したとき、AgentCoreに`{articleUrl, channel, thread_ts}`を渡して呼び出すのがこのパートの終着点です。ここから先はPart2で解説します。

次のPart2では、このBedrock AgentCoreがTavilyで情報を補完しながらMarpスライドを生成する部分を解説します。

サイトの方にもアクセスいただいて、気になるポイントがあればコメントいただけると嬉しいです！

https://whatsnew-marp.nnydtmg.com/
