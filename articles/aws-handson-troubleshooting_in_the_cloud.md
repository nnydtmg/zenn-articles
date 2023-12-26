---
title: "AWS Support - Troubleshooting in the cloud Workshopをやってみた"
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

ここからは各セクションごとにまとめていきますので、興味のあるセクションにとんでください。
なお、すべてのセクションの前提作業は、Self-Paced Labのタブから必要なリソースのデプロイなどをしてください。


# DevOps and Serverless Troubleshooting

このコースではDevOpsとServerlessに関するトラブルシューティングを行います。
CI/CDパイプラインでのデプロイエラーやServerlessアプリケーションの稼働状況確認など、開発からリリースまでをスコープに対応していきます。

:::message
この章は無料利用枠外のリソースを利用するため、コストが気になる方は注意して実施してください。
:::

CloudFormationテンプレートが提供されているので、ダウンロードしてデプロイしている状態からスタートします。CodePipelineのリソースが構成されているかと思います。

:::message alert
TemplateでCloud9を構築するので、default VPCを削除している方はパブリックIPの自動割当を有効化したSubnetを追加で指定してください。
C9IDE:
  SubnetId: !Sub 'subnet-xxxxxxxxxxxx'
また、IAMの構文エラーが出る場合は該当行を削除すればうまくいくので修正してアップロードしてみてください。
:::

## 概要

CloudFormationで構築したパイプラインには、以下のリソースが含まれています。

|ステージ|リソース|
|:--|:--|
|source|Code Commit|
|build|Code Build|
|deploy|Code Deploy|

このパイプラインの中でAPI GatewayからLambda・DynamoDB等をSAM^[[AWS Serverless Application Model](https://docs.aws.amazon.com/ja_jp/serverless-application-model/latest/developerguide/what-is-sam.html)]を使ってデプロイしています。

各問題に共通して、トラブルシューティングのプロセスが定義されています。これを意識しながら問題解決できるようにしましょう。

* パイプラインは何をしますか?なぜ失敗したのですか? (問題を定義する)
* 問題が特定のパイプラインの段階またはアクションにあるのかどうかを特定できますか? （消去の過程）
* ステージが失敗する理由を確認する方法はありますか? (可観測性)
* 特定の一連のイベントから問題の根本原因を絞り込むことはできますか? (タイムラインの構築)


## Issue 1

PipeLineが失敗しているので、解決していきたいと思います。

![](https://storage.googleapis.com/zenn-user-upload/fd79c3902257-20231226.png)

まずはエラーメッセージの確認です。コンソールのSourceActionのメッセージを見てみます。

> The action failed because no branch named mainline was found in the selected AWS CodeCommit repository SampleRepo. Make sure you are using the correct branch name, and then try again. Error: null

つまり、CodeCommitに指定したブランチが見つからないと言われています。今回はCfnテンプレートの中でパイプラインの定義自体も行っているので、ここを更新していきます。
ApplicationPipelineリソースの中のStages > Actions > Configurationの中のBranchNameを正しい値に修正しましょう。

```diff yaml
- BranchName: mainline
+ BranchName: main
```

この状態でCfnスタックのテンプレートを置換更新します。
完了するとコンソールのパイプラインステージのiアイコンから情報を参照すると、更新されていることが分かります。

![](https://storage.googleapis.com/zenn-user-upload/441591f4edb4-20231226.png)

画面右上の「変更をリリース」を押下すると、パイプラインが実行され正常終了することが確認できます。

![](https://storage.googleapis.com/zenn-user-upload/3d90e929340e-20231226.png)

これでIssue1は完了です。

## Issue 2

Issue1で実行したパイプラインが失敗しているので、内容を確認していきます。何はともあれログの確認からです。

![](https://storage.googleapis.com/zenn-user-upload/418e1bd4a372-20231226.png)

![](https://storage.googleapis.com/zenn-user-upload/517f4accee23-20231226.png)

以下のようになっているので、serverless-guard-checkで指定されたLambdaハンドラプロパティを確認します。
```
serverless-guard-check/aws_serverless_function       FAIL
・・・
 Error            = Check was not compliant as property [/Resources/putItemFunction/Properties/Handler[L:86,C:15]] was not present in [(resolved, Path=[L:0,C:0] Value=["src/get-by-id.getByIdHandler","src/get-all-items.getAllItemsHandler","src/put-item.putItemHandler"])]
```

SAMテンプレートを更新しますが、これはCloud9にコピーされているリポジトリに格納されています。
**putItemFunction** のHandlerプロパティを **putItemHandler** に変更します。
そのうえでGitリポジトリに反映させてみます。

再度パイプラインが起動し、うまくBuildされれば完了です。

![](https://storage.googleapis.com/zenn-user-upload/d9547fc126b6-20231226.png)

Issue2は完了です。

## Issue 3

続いてはDeployステージが失敗しているので、確認していきます。

![](https://storage.googleapis.com/zenn-user-upload/fab5b241dc36-20231226.png)

ログを確認すると、S3Bucketというパラメータに問題がありそうです。

> Parameters: [S3Bucket] must have values (Service: AmazonCloudFormation; Status Code: 400; Error Code: ValidationError; Request ID: 2169c3c0-28db-48e4-82bc-ed67f3ec1221; Proxy: null)

定義の仕方にもよりますが、今回はCfnでパイプラインを定義していて、各パイプラインステージにおけるパラメータの連携がうまくできていないことが原因になっていました。
Cfnテンプレートの中で**ParameterOverrides** プロパティを使用すると、動的に値を渡すことが出来るようになるのでCfnテンプレートを更新します。

```diff
Capabilities: 'CAPABILITY_IAM,CAPABILITY_NAMED_IAM,CAPABILITY_AUTO_EXPAND'
+ ParameterOverrides: !Sub '{"S3Bucket": "${pipelineArtifactStore}"}' 
RoleArn: !GetAtt
```

更新後再度Cfnスタックを更新し、「変更をリリース」を実行すると上手くパイプラインが完了するかと思います。

![](https://storage.googleapis.com/zenn-user-upload/963a445abafb-20231226.png)

これにてデプロイパイプラインに関しての問題は解消しましたので、デプロイされたAPIについてトラブルシューティングをしていきます。

## Issue 4

まずは手順通りリクエストを実行してエラーが起きることを確認します。
Getリクエストで値が取得できないことが確認できたので、呼び出されているLambdaのログを確認してみます。しかし、GetItem関数のログに手掛かりになりそうなメッセージは出ていないです。

実は、このWorkshopではX-Rayに統合されているので、CloudWatchの画面からX-Rayのリソースマップを見てみましょう。

![](https://storage.googleapis.com/zenn-user-upload/213fd4c3cf97-20231226.png)

Getメソッド側に障害・エラーになっているのが見えるかと思います。その上で各項目をクリックしてみると詳細が見えるので、トレースログなどを見てみます。

![](https://storage.googleapis.com/zenn-user-upload/18954a4dfcad-20231226.png)

DynamoDBでエラーが起きてそうなので、クリックしてエラーメッセージを見てみます。すると、AccessDeniedExceptionが出ているので、何か権限回りでエラーになっていそうです。

![](https://storage.googleapis.com/zenn-user-upload/4bc3635b7486-20231226.png)

対象のLambdaのIAM権限を確認すると、DynamoDBへのポリシーがアタッチされていないことが分かりましたので、こちらを更新していきます。手順はWorkshopに記載の通りなので割愛します。
手順を実行すると、アプリケーションが再デプロイされるので、完了後に再度APIを呼び出してレスポンスを確認しましょう。正常に値が取得出来ていれば完了です。





## Issue 5




## Issue 6





# Containers Troubleshooting


# Networking and Web Services troubleshooting


# Database troubleshooting


# Additional Learning



