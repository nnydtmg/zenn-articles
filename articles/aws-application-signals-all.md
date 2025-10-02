---
title: "AWS Application SignalsにRUMやCanaryを全部盛りにしてみた"
emoji: "🙆"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","observability","cloudwatch"]
published: false
---

## はじめに
私は普段インフラをメインに担当していて、[CloudWatch]() や [Application Signals]()には興味があるものの、実際に触るとなると、アプリケーションがなく検証がうまくいかないという場面が多々ありました。

今回は生成AIにも手伝ってもらいながら、ReactとSpring BootをベースにしたSPAのTodo Webアプリを作成して、[CloudWatch RUM]()や[CloudWatch Synthetics Canary]()を盛り込んだApplication Signalsの機能を検証してみました。

環境構築はCDKを使って、CloudFront/ALB/ECS/S3/Aurora Serverlessを作っています。

## フロントエンド(React)
ほぼ、生成AIくんが作ってくれました。GPT-4.1とclaude-sonnet-4です。（本当に助かる）




## バックエンド(Java Spring Boot)


## インフラ


## Synthetics Canary


## RUM


## 動作確認


## まとめ

