---
title: "remote-swe-agentsを使って、CDKでApplication Signalsをやってみる"
emoji: "🎉"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","bedrock","cloudwatch"]
published: true
---

# はじめに
みなさんは生成AIでのコード生成してますか？
私はそこまで頻繁にやっているわけではないのですが、さすがに何も知らないのはまずいと思い、手をつけ始めました。。

今では自律型コード生成エージェントまで登場し、コードを書くというハードルがかなり下がってきた印象です。

今回はAWS Sapmlesで提供されている[remote-swe-agents](https://github.com/aws-samples/remote-swe-agents)をSlackで使えるようにして、このアシスタントにOps-JAWSでやった[Application Signalsのデモ](https://github.com/YoshiiRyo1/opsjaws-application-signals-handson)をECS on Fargate化してみます。

# Application Signals
まず、Applicaton SignalsとはOpenTelemetry互換のCloudWatch機能の一つです。ログ・メトリクス・トレースを一元管理し、SLO管理がCloudWatchで完結するため、これまでAWS単体では導入しにくかったオブザーバビリティを、少し手軽にしてくれるものだと感じています。

詳細は、[Ops-JAWSのハンズオン](https://github.com/YoshiiRyo1/opsjaws-application-signals-handson)や他の方の記事を見ていただければと思います。

# remote-swe-agents
これはAWSのSAさんが作成してくれている、bedrockを用いた自律型エージェントを実装するためのソリューションです。
この作成手順としてはリポジトリの通り進めてもらって問題ありませんでした。

:::message alert
Lambdaの同時実行数が設定されているため、アカウント内でクォータ上限緩和をしていない場合は、サポートケースを起票して事前に上限緩和しておく必要があります。
手順としては、「Service Quotas」> 「Lambda」>「Concurrent executions」で`1,000`を指定してリクエストしてください。

私はタイミングが悪く、サポートが混雑していたようで、2週間経っても緩和されませんでした・・・
:::

設定が完了すると、以下のようにSlackからメンションしてGithubリポジトリを読んでもらうことができるようになります。

![](https://storage.googleapis.com/zenn-user-upload/9072ca9637a0-20250622.png)

メンション後はインスタンスが起動するまで数分待ちます。最後のやり取りから一定時間が経つとインスタンスが停止するので、コスト観点では安心ですね。

# コード生成してもらう
対応してもらったリポジトリは[こちら](https://github.com/nnydtmg/applicationsignals-adot-on-ecs)です。

個人的にCDKを利用する際のテンプレート構成があったので、その部分だけ最初にコミットした状態で、ECS周りのリソースを作ってもらいました。(VPCの構築だけできるコードの状態でした)

```
`aws-cdk-lib.aws_ecs_patterns`を使ってALBとECSサービスを定義したいです
リポジトリは applicationsignals-adot-on-ecs を利用してください。
cdkのコードはcdk/以下に作成します。
```

この指示だけで、サンプルイメージを使ったALBとECS(Fargate)の基本構成は作ってくれました。

:::details 回答
リポジトリの構造を確認しました。すでにCDKのプロジェクトが作成されており、基本的なVPCの定義がされています。これから`aws-cdk-lib.aws_ecs_patterns`を使ってALBとECSサービスを定義するコードを追加します。
まずはALBとECSサービスを定義するために、新しいブランチを作成します。
09:50
既存のCDKスタックを確認しました。現在は基本的なVPCの設定のみが定義されています。
これから以下の手順でALB付きのECSサービスを定義します：
1. aws-cdk-lib.aws_ecs_patternsからApplicationLoadBalancedFargateServiceを使用してALB + ECSサービスを定義
2. テスト用のタスク定義とコンテナイメージを設定
3. 必要なセキュリティグループの設定
まず、CDKスタックを編集して、ALB付きECSサービスを定義していきます。
09:51
ALB付きのECSサービスの定義を完了しました。追加した主な機能は以下の通りです：
1. **ECSクラスターの作成**
  - VPC内にFargateタイプのECSクラスターを作成
  - コンテナインサイトを有効化して監視を強化
2. **ALB付きFargateサービスの定義**
  - ecs_patterns.ApplicationLoadBalancedFargateServiceを使用してALBとFargateサービスを一度に定義
  - タスク定義には Amazon のサンプルイメージを使用（デモ用）
  - メモリ: 512 MiB、CPU: 256ユニット
  - デフォルトで2つのタスクを実行
3. **ロギング設定**
  - CloudWatch Logsにコンテナログを出力するよう設定
  - ログ保持期間を1週間に設定
4. **ヘルスチェック設定**
  - ALBのターゲットグループにヘルスチェックを設定
  - ルートパス(/)で200レスポンスを確認
5. **自動スケーリング設定**
  - CPU使用率70%を超えると自動スケールアウト
  - 最小2タスク、最大4タスクまでスケール可能
6. **出力情報の定義**
  - ALBのDNS名とサービスURLを出力として定義
これですべての実装が完了しました。変更をコミットしてプルリクエストを作成します。
:::


そして、追加で指示を出してみます。

```
最小タスク数は1で良いです。
```

すると、適切にコードを変更してくれました。

:::details 回答
承知しました。最小タスク数を1に変更します。現在は自動スケーリング設定で最小2タスクになっているので、これを1に修正します。すぐに変更してコミットします。
09:55
最小タスク数を1に変更しました。以下2箇所を修正しています：
1. 初期のデプロイ時の`desiredCount`を2から1に変更
2. 自動スケーリング設定の`minCapacity`を2から1に変更
変更をコミットし、同じプルリクエストに追加しました。これにより、サービス実行時は最小1タスクで稼働し、負荷に応じて最大4タスクまで自動的にスケールアウトする設定になりました。
これで要件通りに最小タスク数を1に設定できました。他に調整が必要な点があればお知らせください。
:::

ここまでで、[このPR](https://github.com/nnydtmg/applicationsignals-adot-on-ecs/pull/1)が作成されました。問題なさそうなので、マージもしてもらいましょう。

```
ありがとう、マージして
```

:::details 回答
PRのマージが完了しました。これで以下の変更がmainブランチに反映されました：
1. ALB付きECSサービスの追加
  - aws-cdk-lib.aws_ecs_patternsの`ApplicationLoadBalancedFargateService`を使用
  - 最小タスク数: 1
  - 最大タスク数: 4（CPU使用率に基づいて自動スケール）
2. ロギングと監視の設定
  - CloudWatch Logsへのログ出力
  - ヘルスチェック設定
masterブランチで以下のコマンドを実行することで、CDKスタックをデプロイできます：
bash
cd cdk
cdk deploy
サービスが正常にデプロイされると、CloudFormationのOutputsにロードバランサーのDNS名とURLが表示されます。
お役に立てて嬉しいです！他に何かお手伝いできることがあればお知らせください。
:::

デプロイ手順まで添えてくれました。優しいですね。

では、`app/`と`adot/`配下にOpsJAWSで使用したアプリケーションコードとADOTの資源を配置した上で、サイドカーにCloudWatch Agentを使うようなタスク定義を作ってもらいます。
イメージのデプロイについては、[cdk-ecr-deployment](https://github.com/cdklabs/cdk-ecr-deployment)を使おうと思い、こちらは手動で事前に定義しておきました。これはcdklabsのパッケージになるので、別途`npm install cdk-ecr-deployment`でインストールする必要があるので注意です。

```
AppイメージとAdotイメージのデプロイを追加しました。
ApplicationSignalsにメトリクスなどを送りたいので、以下の対応をお願いします。
Adotのサイドカーをタスク定義に追加してください。
コンテナ間通信のため、`adot`というコンテナ名をつけてください
CloudwatchAgentのサイドカーをタスク定義に追加してください。
コンテナ間通信のため、`cw-agent`というコンテナ名をつけてください
```
この指示だけで、かなりの回答を返してくれます。

:::details 回答
承知しました。Application Signalsにメトリクスを送信するために、AdotとCloudWatch Agentのサイドカーコンテナをタスク定義に追加します。まず最新の変更を取得して新しいブランチで作業を開始します。
10:45
最新のリポジトリをpullしたところ、Appイメージとadotイメージが追加されているのを確認しました。これらを利用して、タスク定義にサイドカーコンテナを追加する作業を進めていきます。まずは最新のCDKスタックのコードを確認し、それから必要な変更を加えていきます。
10:46
現在のコードを確認しました。AppイメージとAdotイメージのECRへのデプロイはすでに実装されています。これからタスク定義を更新し、以下のサイドカーコンテナを追加します：
1. adot - ADOTコンテナをサイドカーとして追加
2. cw-agent - CloudWatch Agentコンテナをサイドカーとして追加
新しいブランチ feature/add-sidecars を作成し、作業を進めていきます。
10:48
タスク定義を更新し、ADOTとCloudWatch Agentのサイドカーを追加しました。主な変更点は以下の通りです：
1. **カスタムタスク定義に変更**
  - 単一コンテナからマルチコンテナ構成に変更
  - メモリ: 1024 MiB、CPU: 512に増加（サイドカーを含むため）
2. **コンテナを追加**
  - **メインアプリコンテナ**: ポート8080を公開
  - **ADOTサイドカー**: 名前を`adot`として定義（既存のADOTイメージを使用）
  - **CloudWatch Agentサイドカー**: 名前を`cw-agent`として定義（AWS公式イメージを使用）
3. **IAM権限を追加**
  - タスク実行ロールの作成と権限設定
  - タスクロールの作成と権限設定
  - Application Signalsへのデータ送信に必要な権限を追加
  - X-Ray、CloudWatch、Prometheusなどへの書き込み権限を追加
コード変更を完了しました。これをコミットしてプルリクエストを作成します。
少なく表示する
10:49
すでにご依頼の内容を実装し、プルリクエストを作成済みです。以下の変更を行いました：
1. タスク定義に以下のサイドカーコンテナを追加しました：
  - adot - ADOTのサイドカーコンテナ
  - cw-agent - CloudWatch Agentのサイドカーコンテナ
2. コンテナ間通信ができるように適切な設定を行いました。
3. 必要なIAM権限も追加しました：
  - Application Signalsに必要な権限
  - CloudWatch、X-Ray、Prometheusなどへのアクセス権限
プルリクエストはこちらでご確認いただけます：
https://github.com/nnydtmg/applicationsignals-adot-on-ecs/pull/2
:::

しっかりと関連しそうなリソースへのIAM権限まで考慮してくれていそうです。
ただ、指示がかなり曖昧なので、このままではデプロイができませんでした。この辺りが人間が介入すべき箇所で、これをうまくコントロールできるスキルが求められるんだと感じました。

なお、テストを書いてもらう、デプロイしてもらうまでこのチャットの中でもできます。CICDのロールやワークフローを作る部分もお任せして、コード生成〜テスト〜デプロイまでSlackだけで完結するなんて最高ですね！
このリポジトリではまだそこまではやっていません。。。今後の宿題です。

なんやかんやで、自分自身ではほぼコードを書くことなく、Application Signalsでメトリクスが取得できる状態まで実装することができました。ここまで実稼働時間としては2未満で完了しました。

![](https://storage.googleapis.com/zenn-user-upload/94ac9a670440-20250622.png)

![](https://storage.googleapis.com/zenn-user-upload/a6d5868e04c4-20250622.png)

![](https://storage.googleapis.com/zenn-user-upload/f154fbb328ec-20250622.png)

## 実装の際のツマリポイント

### ARM対応
今回ECSをGravitonで動かしたかったため、PlatformをA`RM64`に指定していました。そのため、アプリケーションやサイドカーのアーキテクチャもARM64指定する必要があり、Dockerfileで`--platform=arm64`を指定しています。
これをしないと、ログに`exec format error`が出るので比較的原因は特定しやすいと思います。

### ランタイムメトリクスの取得
Application Signalsでランタイムメトリクスを取得するためには、[こちら](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AppSignals-MetricsCollected.html#AppSignals-RuntimeMetrics)を参考に適切なエージェントバージョンを選択します。

古いバージョンでもApplication Signalsへのメトリクス出力はできますが、せっかくならランタイムメトリクスまで取りたいので、ここは事前に確認してください。

# 最後に
ざっと個人検証のメモ的になりましたが、まだまだ生成AIに関して自分の使い方も甘い部分があったり、Application Signalsに関してもまだまだ深掘りしていきたいと思うので、コメントなどお待ちしています！

## 追記
### テスト実装
`applicationsignals-adot-on-ecs に対して、snapshotテストとintegテストを実装したい`というメッセージと、`PRが作成されたとき、PRが更新された時にこのスナップショットテストとIntegテストを実行するGithubActionsのCIワークフローを作ってください`というメッセージで、CDKのスナップショットテストとIntegテスト、それをPR作成時にテストとして実行するGithub Actionsワークフローを作成してくれました。

[テスト実装のPR](https://github.com/nnydtmg/applicationsignals-adot-on-ecs/pull/4)

[ワークフロー実装のPR](https://github.com/nnydtmg/applicationsignals-adot-on-ecs/pull/12)

