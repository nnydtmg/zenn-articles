---
title: "AWS Support - Troubleshooting in the cloud Workshopをやってみた③"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","cloudwatch","devops","operation"]
published: false
---
# AWS Support - Troubleshooting in the cloudとは
AWSが提供するWorkshopの一つで、現在(2023/12)は英語版が提供されています。(フィードバックが多ければ日本語化も対応したいとのこと)
クラウドへの移行が進む中でアプリケーションの複雑性も増しています。このワークショップでは様々なワークロードに対応できるトラブルシューティングを学ぶことが出来ます。AWSだけでなく一般的なトラブルシューティングにも繋がる知識が得られるため、非常にためになるWorkshopかと思います。また、セクションごとに分かれているので、興味のある分野だけ実施するということも可能です。

https://catalog.us-east-1.prod.workshops.aws/workshops/fdf5673a-d606-4876-ab14-9a1d25545895/en-US/introduction

学習できるコンテンツ・コンセプトとしては、CI/CD、IaC、Serverless、コンテナ、Network、Database等のシステムに関わる全てのレイヤが網羅されているので、ぜひ一度チャレンジしてみてください。

ここからは各大セクションごとに記事にまとめていきますので、興味のあるセクションにとんでください。
なお、すべてのセクションの前提作業は、Self-Paced Labのタブから必要なリソースのデプロイなどをしてください。

別の章の記事は末尾に追記していきますので、気になる章はリンクから飛んでいただければと思います。

# Networking and Web Services troubleshooting
この章ではWEBサービスの健全性に関して、NWレベルからアプリケーションレベルまで一通りトラブルシューティングを行います。
レコメンデーションサービスを提供しており、WEB3層アーキテクチャで実行されている環境に対してのトラブルシューティングなので、非常に多くの方に刺さる内容なのではないかと思います。

# NW編概要
環境構築はWorkshop資料の中にCloudformationテンプレートがあるのでそちらに沿って準備します。
:::message alert
コストとして円/日程度かかるので気になる方は環境削除を忘れずに。
:::

![](https://storage.googleapis.com/zenn-user-upload/1c50827d03cd-20240509.png)
*workshop studioから引用*

# Issue1
最初のタスクはALBのタイムアウトへの対応です。普段からよく遭遇するトラブルの一つではないでしょうか。




# Issue２


# Issue3


# Issue4


# Issue5


# Issue6


# Issue7


# Issue8




# リンク

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-1

