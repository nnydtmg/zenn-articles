---
title: "Bedrock AgentとTavilyでMarpスライドを自動生成する【3部作 Part2】"
emoji: "🤖"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "bedrock", "bedrockagent", "lambda", "tavily"]
published: false
---

# はじめに

本記事は、AWS What's NewをAIで要約・スライド化してCloudflareで公開するシステムの3部作のPart2です。

システム全体の概要は以下のサマリ記事をご覧ください。

<!-- TODO: サマリ記事のURLを追加 -->

Part1ではAWS What's NewをBedrockで要約してSlackに投稿し、ボタンでBedrock Agentを呼び出すところまでを解説しました。

このPart2では、**Bedrock AgentがTavilyで情報を補完しながらMarpスライドを自動生成し、S3に保存するまで**を解説します。

## このPartで扱う範囲

```
[Bedrock Agent呼び出し] ← Part1より
        ↓
[Bedrock Agent (Claude Sonnet 4.5)]
    ├── [Action Group: Tavily Search]
    │       ↓
    │   [Lambda → Tavily API]
    └── [Action Group: Save Slide]
            ↓
        [Lambda → S3]
                ↓
        [S3: Marpスライド(.md)] → Part3へ続く
```


# 構成

## AWS構成

- **Amazon Bedrock Agent**: オーケストレーションとスライド生成
- **AWS Lambda**: Action GroupのバックエンドとしてTavily呼び出し・S3保存
- **Amazon S3**: 生成したMarpスライド（Markdownファイル）の保存
- **AWS Systems Manager Parameter Store**: Tavily APIキーの管理

## 外部サービス

- **Tavily**: AIに特化したWeb検索API。Bedrock AgentのAction Groupから呼び出し、What's Newの詳細情報を補完するために使用


# 実装

## 1. Bedrock Agentの設定

### エージェントの作成

AWSコンソールまたはCLIでBedrock Agentを作成します。使用するモデルはClaude Sonnet 4.5（`us.anthropic.claude-sonnet-4-5-20251001`）です。

### システムプロンプト

Agentの動作を定義するシステムプロンプトは、スライド生成の品質を大きく左右します。以下のような内容を設定しています。

```
あなたはAWSの最新情報をもとにMarpスライドを作成するエキスパートです。

与えられたAWS What's NewのタイトルとURLをもとに、以下の手順でスライドを作成してください。

1. Tavily Searchツールを使って、URLの内容と関連情報を検索・収集する
2. 収集した情報をもとに、Marp形式のMarkdownスライドを生成する
3. 生成したスライドをS3に保存する

## スライドの構成

- 表紙: タイトル、日付
- サービス概要: 何が変わったか（1〜2枚）
- ユースケース: どんなときに役立つか（1〜2枚）
- まとめ

## Marpの記法

- フロントマターに `marp: true` を含める
- スライドの区切りは `---`
- コードブロックは適宜使用する
- 図解が必要な場合はMermaid記法を使用する
```

## 2. Action Group: Tavily Search

What's Newの詳細情報をWeb検索で補完するAction Groupです。

### Lambda関数

```python
import json
import boto3
import requests

ssm = boto3.client("ssm")

def get_param(name: str) -> str:
    return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]

def search(query: str, url: str = None) -> str:
    api_key = get_param("/whatsnew/tavily_api_key")

    payload = {
        "api_key": api_key,
        "query": query,
        "search_depth": "advanced",
        "max_results": 5,
    }
    if url:
        payload["include_domains"] = [url.split("/")[2]]

    response = requests.post(
        "https://api.tavily.com/search",
        json=payload,
    )
    results = response.json().get("results", [])

    # AgentがそのままコンテキストとしてInjectできる形式に整形
    return "\n\n".join(
        f"### {r['title']}\n{r['url']}\n{r['content']}" for r in results
    )

def lambda_handler(event, context):
    # Bedrock AgentからのAction Group呼び出し形式を解析
    action = event.get("actionGroup")
    api_path = event.get("apiPath")
    params = {p["name"]: p["value"] for p in event.get("parameters", [])}

    query = params.get("query", "")
    url = params.get("url", "")

    result = search(query, url)

    return {
        "actionGroup": action,
        "apiPath": api_path,
        "httpStatusCode": 200,
        "responseBody": {
            "application/json": {
                "body": json.dumps({"result": result}, ensure_ascii=False)
            }
        },
    }
```

### APIスキーマ

Action Groupに紐付けるOpenAPIスキーマです。S3にアップロードしてAction Groupから参照します。

```yaml
openapi: "3.0.0"
info:
  title: Tavily Search API
  version: "1.0"
paths:
  /search:
    post:
      summary: Web検索を実行して情報を収集する
      operationId: tavilySearch
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - query
              properties:
                query:
                  type: string
                  description: 検索クエリ
                url:
                  type: string
                  description: 優先的に参照するURL（省略可）
      responses:
        "200":
          description: 検索結果
          content:
            application/json:
              schema:
                type: object
                properties:
                  result:
                    type: string
                    description: 収集した情報のテキスト
```

## 3. Action Group: Save Slide

生成したMarpスライドをS3に保存するAction Groupです。

### Lambda関数

```python
import json
import boto3
from datetime import datetime

s3 = boto3.client("s3")
BUCKET_NAME = "whatsnew-slides"

def lambda_handler(event, context):
    action = event.get("actionGroup")
    api_path = event.get("apiPath")
    params = {p["name"]: p["value"] for p in event.get("parameters", [])}

    title = params.get("title", "slide")
    content = params.get("content", "")

    # ファイル名: 日付 + タイトルの先頭を使用
    date_str = datetime.now().strftime("%Y%m%d")
    safe_title = title[:30].replace(" ", "-").replace("/", "-")
    key = f"slides/{date_str}-{safe_title}.md"

    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=content.encode("utf-8"),
        ContentType="text/markdown",
    )

    return {
        "actionGroup": action,
        "apiPath": api_path,
        "httpStatusCode": 200,
        "responseBody": {
            "application/json": {
                "body": json.dumps({"s3_key": key}, ensure_ascii=False)
            }
        },
    }
```

### APIスキーマ

```yaml
openapi: "3.0.0"
info:
  title: Save Slide API
  version: "1.0"
paths:
  /save:
    post:
      summary: MarpスライドをS3に保存する
      operationId: saveSlide
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - title
                - content
              properties:
                title:
                  type: string
                  description: スライドのタイトル（ファイル名に使用）
                content:
                  type: string
                  description: Marp形式のMarkdownコンテンツ
      responses:
        "200":
          description: 保存結果
          content:
            application/json:
              schema:
                type: object
                properties:
                  s3_key:
                    type: string
                    description: 保存先のS3キー
```

## 4. AgentへのAction Group登録

作成した2つのAction GroupをBedrock Agentに登録します。登録後はAgentのエイリアスを発行し、Part1のLambdaから呼び出せるようにします。

| Action Group名 | Lambda | スキーマ |
|---|---|---|
| `TavilySearch` | `whatsnew-tavily-search` | `s3://whatsnew-schemas/tavily-search.yaml` |
| `SaveSlide` | `whatsnew-save-slide` | `s3://whatsnew-schemas/save-slide.yaml` |

## 5. Lambdaへの権限付与

各LambdaがBedrock Agentから呼び出されるように、リソースベースポリシーを追加します。

```bash
aws lambda add-permission \
  --function-name whatsnew-tavily-search \
  --statement-id bedrock-agent \
  --action lambda:InvokeFunction \
  --principal bedrock.amazonaws.com \
  --source-arn arn:aws:bedrock:<region>:<account>:agent/<agent-id>
```

`whatsnew-save-slide` も同様に設定します。


# Agentの動作フロー

Bedrock Agentは渡された入力をもとに、以下のようにツールを使いながらスライドを生成します。

1. **入力受け取り**: Part1のLambdaから「タイトル + URL」を受け取る
2. **Tavily検索**: URLをもとに記事の詳細内容と関連情報を検索
3. **スライド生成**: 収集情報とシステムプロンプトをもとにMarp Markdownを生成
4. **S3保存**: 生成したスライドをS3に保存し、キーをレスポンスとして返す

Bedrock Agentの[ReAct](https://arxiv.org/abs/2210.03629)ベースのオーケストレーションにより、検索結果が不十分な場合は自動的に追加検索を行うこともあります。


# ポイントと注意点

## Tavilyの検索精度

Tavilyは `search_depth: "advanced"` にすることで、より詳細なコンテンツを取得できます。ただしAPIコストが上がるため、用途に応じて `"basic"` との使い分けを検討してください。

## AgentのInvoke方法

Part1でも触れましたが、Bedrock Agentの`invoke_agent`はストリーミングレスポンスを返します。完全なレスポンスを受け取るには、`completion`イベントを最後まで読み切る必要があります。

```python
full_response = ""
for event in response["completion"]:
    if "chunk" in event:
        full_response += event["chunk"]["bytes"].decode()
```

## スライドのファイル名管理

S3のキーにはタイトルの先頭文字列を使っていますが、特殊文字や日本語が含まれる場合はURLエンコードが必要な場面もあります。今回はタイトルの英数字・ハイフン以外を除去するシンプルな正規化にとどめています。


# まとめ

Part2では以下を実装しました。

- Bedrock Agentのシステムプロンプト設計
- Action Group: TavilyによるWeb検索（情報補完）
- Action Group: 生成スライドのS3保存
- Bedrock AgentのReActオーケストレーションによる自律的なスライド生成

次のPart3では、S3に保存されたMarpスライドをCloudflare PagesとWorkers経由で公開する部分を解説します。
