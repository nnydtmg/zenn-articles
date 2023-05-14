---
title: "Global Azure 2023に参加しました"
emoji: "🗂"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["azure","ug"]
published: true
---

# Global Azure 2023とは

まずは簡単にGlobal Azureの説明からすると、

> 世界中のAzureユーザーグループが同時に勉強会を行うイベントで、Azureだけでなくクラウドコンピューティングを学ぶことができる。
> 今年は89のコミュニティが102のイベントを開催していた。

公式サイトはこちらです。
https://globalazure.net/

# 概要

私が参加したセッションの一覧です。

|タイトル|登壇者|
|:--|:--|
|Virtual EC WebSite Implemented by multi lang run on Azure Spring Apps.|寺田さん|
|Azure Policyとガバナンスのおはなし|オルターブース 馬場さん|
|Pulumi de Azure IaC|オルターブース 花岡さん|
|Azure OpenAI Service + Semantic Kernel (C#)|千代田まどか(ちょまど)さん|
|何も変えてないのにAzure Static Web Apps上の個人ブログがダウンしたお話|kdk_wakaba さん|
|祝GA！！ Azure Communication Services のメール送信機能について|onarimonprogram さん|
|Azure Virtual Desktopの今|iwai_d さん|

日本のイベントページはこちらです。
https://jazug.connpass.com/event/279068/

ここから雑多ではありますが、参加メモを残しておきます。

# Microsoft 寺田さん

Azure Spring AppsはJava以外のランタイムも動かせるコンテナ基盤。

ハンズオンがGithubにあり、複数言語でECサイトを構築している例を試すことができる。(見つけられていないです。。)
※モニタリングは手動で設定する必要がある（Java以外。Javaはマネージド）

デモの中ではChatGPTにも触れていて、役割を適切に設定することで、分野に沿った問い合わせに設定することもできる。
ECサイトの問い合わせに天気やご飯屋さんを聞いても答えないなど。

ユースケース
k8sとの比較：k8sの運用の煩雑さから脱却できる。
k8sは、
* 商用運用の時はリソース・ディスク・ネットワーク・無停止更新・可用性・セキュリティなどの考慮が必要になる
* 進化が早い
* 大規模k8sクラスタは巨大モノリスを作るのと同じ

![](https://storage.googleapis.com/zenn-user-upload/0ccba8cd38c5-20230513.jpeg)


結局は、壊れてもすぐに復旧できるシステム作りが大事。

本当にやりたいことは何か。ここを見極めてサービスを選定すること。
k8s触りたい？サービスを提供したい？


SpringAppsはDockerfileすらいらない！ソースコードさえあれば最短３コマンドでできる。
その分値段は高いが、パブクラのコストは人件費も含めたTCOで換算することが重要。

FedexとかRally'sとか大手企業利用も増えている

basic,standard,enterpriseのプランがある。
enterpriseがdotnet,node,python,goをサポートしている。Tanzuを応用してVMwareと共同開発している。


## 質問
* コンテナイメージの作成も不要というのはどういうことか
ソースがあればコマンド実行時に裏で言語判定してイメージ作成までしてくれる

* 環境変数の設定や証明書管理も出来るのか
どちらも出来る

* SLAが99.9%だが、構成などでより高いSLAにする方法はあるのか
クラスター冗長でSLAは上げるしかない

* WebAppsとの使い分けはどういうイメージか
サービスの数が少ない場合はAppService、サービス間連携が増えるとSpringApps

* アプリケーション開発者から見ると、WebAppsのプラン上に複数ホストできるのは変わらないと思うがどうか
サービスごとに言語を変えたいとか、コンテナAppsとはDockerfileすら作りたくない場合はSpringを使う


# Azure Policyとガバナンスのおはなし

Azureの権限周りのお話(そもそも設定しないと権限エラーは出ないよ)

ガバナンス設定をすることで作成可能リソースまで指定できる。そうするとコスト管理にも反映できるので、必ずやるべき。

リソースごとのポリシー定義とポリシーをまとめたイニシアチブ定義があり、親スコープは子スコープを継承する構成。

PolicyとRBACは違う
* Policyはやってはいけないことを定義
* RBACはやって良いことの許可を与える

ガバナンスは **運用することが大事** 

ガバナンスを定義するためのCloud Application Framework(CAF)は以下

https://learn.microsoft.com/ja-jp/azure/cloud-adoption-framework/resources/tools-templates


サブスクリプションごとのガバナンスやポリシーを可視化するツール(Azure Governance Visualizer)がある。

https://github.com/JulianHayward/Azure-MG-Sub-Governance-Reporting

自動化もしてガバナンスも継続的に見ることが大事。



# Pulumi de Azure IaC

Pulumiとは、既存の言語でIaCできるツール
(TSやPythonでかける、ほぼCDKとコマンドも同じ、テストも書けるのが開発言語IaCの利点)

Pulumiも状態管理はする(Pulumiクラウドやオブジェクトストレージに保存)

ここでライブデモがあり、実際にリソース構築出来ていた。

## 質問

* コード行数
工夫次第、モジュール化できる、言語特性に寄せる

* ステート管理
Pulumiクラウド、オブジェクトストレージ

* 既存リソースをIaC配下にインポートできるか
実際にしたことはないがコマンド自体はあるので出来るはず
Terraformから移行もできる、Terraform Providerも流用できる

* ディレクトリ構成のベストプラクティス（Workspace的なもの）
スタック単位でConfigを分けることで環境設定を変える、If文などでも可能



# Azure OpenAI Service + Semantic Kernel (C#)

基本的にデモをやりながら、超高速解説だったので、書くこと多すぎて間に合ってない。。。

LLMについて概要を話しながら、OpenAI Serviceでチャットを作るというデモで、ロールの与え方やいろんな参考資料について紹介。

https://twitter.com/nnydtmg/status/1657268647541260289?s=61&t=nS_iYk96zWrfWjxryyQ2ow

Semantic Kernelについても軽く紹介がありましたが、詳しくは時間切れで懇親会に持ち越しでした。


# 最後に

セッションがかなり濃く、あまり写真など載せられず殴り書きになってしまい申し訳ないです。

配信動画が公式Youtubeに上がっているのでチェックしてみてください。
Azureの最新情報やAI情報、ユーザー目線での上手な使い方が多岐にわたって紹介されているので、とても勉強になりました。

> https://www.youtube.com/live/hBqhI1iUuMM?feature=share
> https://www.youtube.com/live/LQhihic-PCg?feature=share
