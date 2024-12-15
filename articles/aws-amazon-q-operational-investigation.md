---
title: "Amazon Q Developerを使って障害調査を高速化！"
emoji: "🙆"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","amazonQ","cloudwatch"]
published: false
---

この記事は[JAWS-UG（AWS Users Group – Japan） Advent Calendar 2024](https://qiita.com/advent-calendar/2024/jaws-ug)の17日目の記事です。

# はじめに
12/1-12/6に行われたre:Invent2024にて、とあるアップデートが発表されました。
それが、[こちら](https://aws.amazon.com/about-aws/whats-new/2024/12/amazon-q-developer-operational-investigation-preview/)の**Amazon Q Developerが運用調査機能を追加**(プレビュー)というものです。

このタイトルだけではあまりイメージが付きにくいかと思いますが、実は結構面白くてインパクトのある内容です。なので簡単に現時点(2024/12/15　プレビュー段階)での機能をご紹介したいと思います。
今後のAWS運用が大きく変わるかもしれません。

# Amazon Q Developerとは
ここでは説明不要かもしれませんが、簡単に。
re:Invent2023でプレビュー発表された、AWSによる生成AIアシスタント機能の総称です。今年のre:InvnetではこのAmazon Q Developerに関するアップデートが、CEO Keynoteでも多数発表されていました。

https://www.youtube.com/watch?v=LY7m5LQliAo

以下は一例です。
* Unit Test作成
* ドキュメント作成
* コードレビュー

など多数の、開発者アシスタントとしての機能が発表されています。
これらの機能については他の方も多数記事にしていただいているので、そちらを参照いただくのが良いかと思います。

https://qiita.com/yoshimi0227/items/336d2d1d9cd50c050754

https://qiita.com/har1101/items/b303e9105b29b9bdd525

そんな中、AWSでのOperationに関わるセッション(Building the Future of cloud operations at any scale(COP202))で紹介されていたのが、今回ご紹介する**Amazon Q Developer adds operational investigation capability**です。
このセッションはYoutubeにも公開されているので、こちらも見ていただきつつ、このセッションサマリーはAWSさんからブログとしても発表されています(日本語訳もしてくださっています。)。

https://www.youtube.com/watch?v=iT3er0h06Dk

https://aws.amazon.com/jp/blogs/news/top-announcements-for-aws-cloud-operations-at-reinvent-2024/


# どんなもの？
一言でいうと、**AWS上での障害調査を、AIが関連情報を提案しながら、よりスピーディに解決まで伴走してくれる機能**です。

これまでAWS上で障害が発生した場合、CloudWatch Alarmがトリガーされユーザーに通知が来ます。そこからアラームの元となったメトリクスやログを追い、必要に応じてサーバーへのログインやECSサービスの切り戻しなどを行っていたと思います。

今回のアップデートでは、Alarmがトリガーされた時に自動で関連するメトリクスやログを提示するだけでなく、テレメトリやデプロイメント、AWS Healthイベントなどを含めAWS全体のデータを元に、障害の根本原因を解決するために必要なデータを提示してくれるという素晴らしい機能が発表されました。
さらにこれに付随して、障害調査の記録をマネジメントコンソール上で残すことができます。Amazon Qが提示した情報が正しければ、それを障害調査記録としてワンクリックで調査記録として保存できます。

現状はバージニア北部リージョン(us-east-1)でのみ、プレビュー利用が可能です。また、ワークロードがなくても、サンプルとして調査アシスタントの機能を実行することが可能です。


# 触ってみる
今回は簡単に触ってみた点をまとめていこうと思います。

## サンプル操作
まずはサンプルの調査対応を見てみます。
バージニア北部にてCloudWatchのサービスページに遷移します。**AIオペレーション**機能が追加されているのが分かります。

![](https://storage.googleapis.com/zenn-user-upload/116ed1878332-20241215.png)

この右側の`Try a sample investigation`を選択するとサンプル調査シナリオを体験することができます。以下サンプルです。

![](https://storage.googleapis.com/zenn-user-upload/a9bf62056a98-20241215.png)

右側のパネルがQ Developerの提示した障害に関係のあるメトリクスや操作記録になっています。

ここから分かるのは一定期間DynamoDBのスロットリングが起きていて、その原因として提示されているのが、`Observation for AWS DynamoDB Deployment`でDynamoDBに対して変更が行われた記録です。これが根本原因として正しければ、右側のパネルの`Accept`をクリックすると左側の記録に`Feed`として追加されます。

![](https://storage.googleapis.com/zenn-user-upload/16a68e04fc3d-20241215.png)


## 有効化
実際にアカウントで機能を利用するためには、アカウントで機能を有効化する必要があります。

![](https://storage.googleapis.com/zenn-user-upload/116ed1878332-20241215.png)

`Configure for this account`から設定していきます。

![](https://storage.googleapis.com/zenn-user-upload/9c053d6ec3eb-20241215.png)

ロググループの設定やログの保持期間、ユーザーのアクセス権限を設定します。が、今回はデフォルトで進めます。

![](https://storage.googleapis.com/zenn-user-upload/ca7c19e81698-20241215.png)

![](https://storage.googleapis.com/zenn-user-upload/3f46b995bb48-20241215.png)

Amazon Q DeveloperへのIAM権限や、管理するアプリケーションのタグ選択、CloudTrailイベントを統合するか、X-Rayを利用した全体マッピング、AWS Healthとの統合を設定します。

![](https://storage.googleapis.com/zenn-user-upload/0e003c59b24f-20241215.png)

チケットシステムとの統合も可能です。現状はJiraとServiceNowが選択可能です。

![](https://storage.googleapis.com/zenn-user-upload/4c803eae8489-20241215.png)

また、SNSと統合することでChatbotを利用して通知から調査の連携が可能になっています。
これでアカウントで利用するまでの設定は完了です。


## 検証
今回検証用に利用するのはOpsJAWSでApplication Signalsハンズオンを実施した際の[リポジトリ](https://github.com/YoshiiRyo1/opsjaws-application-signals-handson/tree/mainhttps://github.com/YoshiiRyo1/opsjaws-application-signals-handson/tree/main)です。

任意のメトリクスがアラート状態になるようなCloudWatchアラームを作成します。
アラームアクションに`調査アクション`という項目があるので、ここに作成した調査グループを設定します。

![](https://storage.googleapis.com/zenn-user-upload/c27b8aefde1e-20241215.png)

アラーム状態になるとInvestigationsにOpen状態のものが作成されます。

![](https://storage.googleapis.com/zenn-user-upload/50ec1721ec5f-20241215.png)

![](https://storage.googleapis.com/zenn-user-upload/6dca651da786-20241215.png)

開いてみると、現状はまだ何もSuggestされていません。

![](https://storage.googleapis.com/zenn-user-upload/388483f28e75-20241215.png)

Amazon Q logsを開いてみると、このアラームが設定されてからQがどのような調査をしたかを確認することができます。
各サービスに対して関連するメトリクスを調査している様子が分かります。

![](https://storage.googleapis.com/zenn-user-upload/5a96ef96bbe2-20241215.png)

QからのSuggestが全然来ないので、若干今回の例は悪かったかもしれません。

メトリクス側からInvestigatonに追加することも可能です。
X-Rayの画面からメトリクスを選択し、`既存の調査に追加`を選択するとInvestigation側にFeedが追加されています。
また、`Add note`からコメントを追加することもできるので、障害調査の記録を全て時系列順にまとめていくことができます。

![](https://storage.googleapis.com/zenn-user-upload/9d4f588b7e35-20241215.png)

![](https://storage.googleapis.com/zenn-user-upload/eff0ffe71c9b-20241215.png)

こうすることで、これまでチームごとに障害調査の記録を残す方法がSlackやナレッジツールに散らばることがなく、かつ、メトリクス情報も簡単に残しながらAWSで完結することができます。
これによってナレッジツールとしてAWSを活用するような利用方法も考えられます。


# 最後に
今回のアプリケーション例は良くなかったですが、AWS内で全ての障害調査を記録を残しながら完結するという部分はお伝えできたかと思います。
今後は別のアプリケーションでQからSuggestしてもらえるような検証をしてみたいです。

ナレッジ管理に困っている方や、AWS以外のプラットフォームが使いにくい環境な方には非常に有益なアップデートになっているかと思いますし、スキルトランスファーが難しい障害対応に対して、Qがサポートしてくれるこのアップデートは激アツだと個人的には感じています。

ぜひ東京リージョンでのサポートとGAを待ちたいと思います。

