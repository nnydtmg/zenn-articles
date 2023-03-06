---
title: "AWS CDKで毎日の料金をSlackに通知する機能を実装してみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","CDK","Cost","Slack"]
published: false
---

# やりたいこと

AWSの利用料は予算管理をしていても、予算の指定したパーセンテージに達するか、請求が確定するまでデフォルトでは通知ができません。
消し忘れのリソースについては1日でも早く気が付きたいです。
そのためには毎日コスト状況を確認する事が大事です。

ということで、毎日Slackに利用料を通知する仕組みを作ってみようと思います。
この手の話は沢山の方が記事にされているので、そこまで新規性はないですが、やったことメモ的な感じで残しておきます。

また、せっかくなのでCDKを使ってLambdaまで構築してみようと思います。
CDKはTypescript、Lambdaはpythonで作成してますが、個人的な趣味なので、気になる方は書き換えてください！


# 環境

構築環境はこちらです。

* WSL2上のUbuntu22.04
* node : v18.12.1
* CDK  : 2.54.0 (TypeScript)
* AWS東京リージョン
* Lambda:Python3.9


# 構築

## Slackチャンネル設定

SlackでWebHookを受けられるように設定を行います。

通知したいチャンネルを作成し、チャンネルの設定から、「アプリを追加する」を選択し、「Appディレクトリを表示」をクリックすると、ブラウザにSlackのアプリ設定画面が開きます。

<!--image-->

Create AppからNameSpace等を設定し、Webhookの許可を行います。

<!--image-->

「Add New Webhook to Workspace」をクリックすると、チャンネル用のURLが表示されますので、コピーしておきます。

<!--image-->


## CDKプロジェクト作成

基本的な構築手順はAWSの[公式入門手順](https://aws.amazon.com/jp/getting-started/guides/setup-cdk/module-three/)等を参考に、initします。

スタック名は今回、`AwsCostalertSlackappStack` という名前で作成しています。


## Lambda作成

「lambda」というディレクトリに「app.py」を作成していきます。

```python:app.py
# lambda/app.py

# encoding: utf-8
import json
import datetime
import requests
import boto3
import os
import logging

TODAY = datetime.datetime.utcnow()
FIRST_DAY_OF_THE_MONTH = TODAY - datetime.timedelta(days=TODAY.day - 1)
START_DATE = FIRST_DAY_OF_THE_MONTH.strftime('%Y/%m/%d').replace('/', '-')
END_DATE = TODAY.strftime('%Y/%m/%d').replace('/', '-')

SLACK_POST_URL = os.environ['SLACK_POST_URL']
SLACK_CHANNEL = os.environ['SLACK_CHANNEL']

logger = logging.getLogger()
logger.setLevel(logging.INFO)

client = boto3.client('ce')
sts = boto3.client('sts')
id_info = sts.get_caller_identity()

def get_total_cost():
    response = client.get_cost_and_usage(
        TimePeriod={
            'Start': START_DATE,
            'End': END_DATE
        },
        Granularity='MONTHLY',
        Metrics=[
            'UnblendedCost',
        ],
    )

    total_cost = response["ResultsByTime"][0]["Total"]["UnblendedCost"]["Amount"]
    return total_cost

def handler(event, context):
    text = "ID:{} の {}までのAWS合計料金 : ${}".format(id_info['Account'], END_DATE, get_total_cost())
    content = {"text": text}

    slack_message = {
        'channel': SLACK_CHANNEL,
        "attachments": [content],
    }

    try:
        requests.post(SLACK_POST_URL, data=json.dumps(slack_message))
    except requests.exceptions.RequestException as e:
        logger.error("Request failed: %s", e)
```

少しだけコードの解説をすると、



## Lambda Layer作成

requestsモジュールを使うために、Lambda Layerを作ります。
boto3も必要があればインストールします。

```
mkdir lambda_layer  && cd lambda_layer

mkdir python
pip install -t python requests boto3
```




## CDKスタック作成

CDKのスタックを更新します。

```ts:aws-costalert-slackapp-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from "aws-cdk-lib/aws-events";
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';

export class AwsCostalertSlackappStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // lambda-layer
    const layer = new lambda.LayerVersion(this, 'MyLayer', {
      code: lambda.Code.fromAsset("lambda_layer"),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_9],
    });
    
    // lambda
    const sampleLambda = new lambda.Function(this, 'NptifyPriceHandler', {
      runtime: lambda.Runtime.PYTHON_3_9,    // execution environment
      code: lambda.Code.fromAsset('lambda'),  // code loaded from "lambda" directory
      handler: 'app.handler',                // file is "hello", function is "handler"
      environment: {
        TZ: 'Asia/Tokyo',
        SLACK_POST_URL: 'コピーしたURL,
        SLACK_CHANNEL: '送信先チャンネル',
      },
      layers: [layer],
      initialPolicy: [new iam.PolicyStatement({
        actions: ['ce:GetCostAndUsage'],
        resources: ['*'],
      })],
    });

    // EventBridge
    new events.Rule(this, "sampleRule", {
      // JST で毎日 AM9:10 に定期実行
      // 参考 https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/events/ScheduledEvents.html#CronExpressions
      schedule: events.Schedule.cron({minute: "10", hour: "0"}),
      targets: [new targets.LambdaFunction(sampleLambda, {retryAttempts: 3})],
  });
  }
}
```

lambdaコンストラクトを利用するため、以下コマンドでインストールします。

```
npm install @aws-cdk/aws-lambda
```

## CDKデプロイ

アカウント内かつ構築リージョンで初回実行の方はbootstrapが必要になります。

```
cdk bootstrap
```

作成したスタックをデプロイしてみましょう。

```
cdk deploy
```

正常に終了後、マネジメントコンソールでCloudFormationを確認してみましょう。
スタックが作成されているはずです。
後は実行されるまで待ちます。




