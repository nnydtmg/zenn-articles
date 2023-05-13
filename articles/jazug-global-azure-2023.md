---
title: "Global Azure 2023に参加しました"
emoji: "🗂"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["azure","ug"]
published: false
---

# Global Azure 2023とは

世界中のユーザーグループが同時に勉強会を行うイベント。
Azureだけでなくクラウドコンピューティングを学ぶイベント。
89のコミュニティが102のイベントを開催


# 概要

|タイトル|登壇者|
|:--|:--|
|Virtual EC WebSite Implemented by multi lang run on Azure Spring Apps.|寺田さん|
|Azure Policyとガバナンスのおはなし|オルターブース 馬場さん|
|Pulumi de Azure IaC|オルターブース 花岡さん|
|Azure OpenAI Service + Semantic Kernel (C#)|千代田まどか(ちょまど)さん|
|何も変えてないのにAzure Static Web Apps上の個人ブログがダウンしたお話|kdk_wakaba さん|
|祝GA！！ Azure Communication Services のメール送信機能について|onarimonprogram さん|
|Azure Virtual Desktopの今|iwai_d さん|


https://jazug.connpass.com/event/279068/


# MS 寺田さん

Azure Spring AppsはJava以外のランタイムも動かせる

ハンズオンがGithubにある
複数言語でECサイトを構築している例
※モニタリングは手動（Java以外）

ChatGPTは分野に沿った問い合わせに設定することもできる
役割設定が大事。ポジティブコメントへのレスポンスもできる
（Javaの会で発表している要チェック）

ユースケース
k8sとの比較：k8sの運用の煩雑さ
商用運用の時はリソース・ディスク・ネットワーク・無停止更新・可用性・セキュリティなどの考慮が必要になる
進化が早い
大規模k8sクラスタは巨大モノリスを作るのと同じ

![](https://storage.googleapis.com/zenn-user-upload/0ccba8cd38c5-20230513.jpeg)

壊れてもすぐに復旧できるシステム作りが大事
 Design for failar

本当にやりたいこと
触りたい？サービスを提供したい？

SpringAppSはDockerfileすらいらない
ソースコードさえあれば最短３コマンドでできる→pagesのような感じ？

値段は高い

fedexとかRally'sとか大手企業利用も増えている

basic,standard,enterpriseのプラン
enterpriseが.net,node,python,goをサポート、VMwareと共同開発（Tanzuを応用

SpringAppsは要注目

コンテナイメージの作成も不要
ソースがあればコマンド実行時に裏で言語判定してイメージ作成までしてくれる

環境変数の設定もできる
証明書管理の機能もある
クラスター冗長でSLAは上げるしかない
WebAppsとSpringAppsの使い分け
→サービスの数が少ない場合はAppService、サービス間連携が増えるとSpringApps
アプリケーション開発者から見ると、WebAppsのプラン上に複数ホストできるのは変わらない
→サービスごとに言語を変えたいとか
　コンテナAppsとはDockerfileすら作りたくない場合はSpringを使う



# Azure Policyとガバナンスのおはなし
Azureの権限周りのお話
そもそも設定しないと権限エラーは出ないよ

ガバナンス設定をすることで作成可能リソースまで指定できる→コストにも反映できる

ポリシー定義＜イニシアチブ定義：親スコープは子スコープを継承する

PolicyとRBACは違う
Policyはやってはいけないことを定義
RBACはやって良いことの許可を与える

ガバナンスは運用することが大事

CAFは以下

https://learn.microsoft.com/ja-jp/azure/cloud-adoption-framework/resources/tools-templates


Azure Governance Visualizer

https://github.com/JulianHayward/Azure-MG-Sub-Governance-Reporting

自動化もしてガバナンスも継続的に見る



# Pulumi de Azure IaC
Pulumiとは
既存の言語でIaCできるツール
（正直Terraformより使いたい、、

Pulumiも状態管理はする（オブジェクトストレージに保存
TSやPythonでかける
ほぼCDKとコマンドも同じ
テストも書けるのが開発言語IaCの利点

コード行数
　工夫次第、モジュール化できる、言語特性に寄せる
ステート管理
　Pulumiクラウド、オブジェクトストレージ
インポートできるか
　Terraformから移行できる
　Terraform Providerも流用できる
　インポート機能はある
ディレクトリ構成のベストプラクティス（Workspace的なもの）
　スタック単位でConfigを分けることで環境設定を変える
　If文などでも可能



# Azure OpenAI Service + Semantic Kernel (C#)

OpenAIの画面での説明
サンプルコードの出力まで

デモをやる（C＃
これは動画で見る

書くこと多すぎて間に合ってない








