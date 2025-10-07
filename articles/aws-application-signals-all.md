---
title: "AWS Application SignalsにRUMやCanaryを全部盛りにしてみた"
emoji: "🙆"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","observability","cloudwatch","cdk"]
published: true
---

:::message
この記事は人間が書きました。
記事中のコード生成はAIが8割進めてくれました。
:::

## はじめに
私は普段インフラをメインに担当していて、[CloudWatch](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html) や [Application Signals](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Monitoring-Sections.html)には興味があるものの、実際に触るとなると、アプリケーションがなく検証がうまくいかないという場面が多々ありました。

今回は生成AIにも手伝ってもらいながら、ReactとSpring BootをベースにしたSPAのTodo Webアプリを作成して、[CloudWatch RUM](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch-RUM.html)や[CloudWatch Synthetics Canary](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch_Synthetics_Canaries.html)を盛り込んだApplication Signalsの機能を検証してみました。

環境構築はCDKを使って、CloudFront/ALB/ECS/S3/Aurora Serverlessを作っています。

## アプリケーション(React/Spring Boot)
ほぼ、生成AIくんが作ってくれました。

ベースは[aws-remote-swe](https://github.com/aws-samples/remote-swe-agents)を使って、Slackから指示を出してベースを作ってもらい、修正が必要な箇所をIDEで編集するように進めました。GPT-4.1とclaude-sonnet-4を使いました。（本当に助かる）

Vibeコーディング（やってみたかった）で、要件を伝えました。

:::details 要件プロンプト

```
SPAでTodoアプリケーションを作りたいです。構成は以下を想定しています。

要件
- フロントエンドはReactを使用する
- バックエンドはJava(フレームワークは問わない)
    - APIはコンテナで実装する
- データベースはMySQLを使用する
- インフラはAWS上にCDK(TypeScript)で構築する
- フロントエンド・バックエンド・CDKそれぞれでテストコードを実装する

機能
- タスクの追加・削除・編集・ステータス変更（完了/未完了）ができる
- Auroraはserverlessv2を使ってコストを抑える
- フロントエンドはCloudFront + S3の構成で、CloudFront -> ALBはVPC Originで実装する

まずはフロントエンドの実装から進めて、次にAPIを作成したところで確認を出してください。
```
:::

ほぼこれだけです。（すごい時代だ。。）
多分、Todoアプリのような基本中の基本であれば、難なくこなしてくれる感じですね。

一度指示を出してから30分もしないうちにベースは完成していました。

ローカルでテストできるように`dev container`まで作ってもらい、本当にここまで日本語以外タイプしていません。
実際に出てきたコードを`npm run`するとローカルで動くアプリが立ち上がりました。

DBのマイグレーションSQLまで[Flyway](https://github.com/flyway/flyway)で導入しているので、MySQLのコンテナを`docker compose`などで同時に立ち上げてしまえば、DBの設定もなしに検証することができます。この`docker compose`の設定も全て作ってもらいました。

できたアプリケーション画面はこんな感じです。

![](https://storage.googleapis.com/zenn-user-upload/023151c43509-20251004.png)
*TODOアプリの画面*

## インフラ
ローカルで実行できる状態まで確認できたので、いよいよAWS上にデプロイしていきたいと思います。
先ほどの要件の中でも伝えていましたが、念の為再度伝えてあげます。

:::details 要件プロンプト

```
ローカルで起動が確認できたので、これをAWS上にデプロイしたいです。
CDK(TypeScript)を使って、L2コンストラクトをベースに作成してください。
作るリソースは以下です。必要に応じてスタックは分割して良いですが、基本的には1スタックで実装してください。

- Aurora MySQL(ServerlessV2)
- ECS Fargate(タスク数1、オートスケールなし)
- ECR
- ALB(HTTP)
- CloudFront(HTTPS-HTTPリダイレクト、代替ドメインなし)
- S3

また、フロントエンドの資材は../frontend/buildディレクトリにビルドされていて、バックエンドコンテナは../backend/Dockerfileを元にビルド・ECRプッシュを行ってください。

実装できればcdk synthを実行して、そのアウトプット結果を連携してください。
```
:::

この指示で7割くらいのCDKコードが生成されました。
結果も送ってくれるようにしたので、確実にsynthできる状態で手元にコードがもらえるのがちょっと安心ポイントですね。

とはいえ、細かなパラメータや論理名などが気になるので、手で修正してあげます。この後で再度プロンプトに指示を出すと、リモートリポジトリとローカルリポジトリの状態が違うので、対象のブランチを提示するなどをしつつ、確実にリモートから更新内容を取得するように指示をしてあげる必要があります。

CDKのデプロイ自体は自身のローカルから実施しているので、認証情報を渡す必要もなく安全に実装を進めまられました。

CDKでのデプロイまで最初の指示から1.5時間くらいで完了しました。素晴らしい。


## Application Signals
ここからが本題です。

正常にTODO登録ができるようになったので、実際にモニタリングを実装していきます。まずは、バックエンドアプリケーションのモニタリングを導入します。

Appication Signalsはアカウントで初回有効化する必要があります。私は有効化済みのためスキップします。

[OpenTelemetry](https://opentelemetry.io/)(以降はOtel)をベースにした、サービスマップを出せるようにしたいと思います。

AWSではOtelをベースにした[ADOT](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/Container-Insights-EKS-otel.html)を提供しており、AWSのサポートを受けながらOtel導入ができるので、こちらもご利用ください。

今回は純粋なOtelを使います。Otel(ADOTも同じですが)の素晴らしいところは、`自動計装`を利用すればアプリケーションコードに一切手を加えずに、オブザーバビリティに必要な`ログ`・`メトリクス`・`トレース`を簡単に取得ができてしまうというところです。

ランタイムメトリクスをとるだけであれば、Javaの起動オプションにエージェントを指定するだけです。

今回は、ログやトレースも合わせて取得したいので、`logback`の設定を加えていきます。これも生成AIにお願いしてみたいと思います。
なお、Application Signalsの導入方法については[こちら](https://zenn.dev/ryoyoshii/articles/68c3fa714dacd2)の記事で一通り解説されています。

:::details プロンプト

```
バックエンドアプリケーションにApplication Signals用の設定を加えたいです。
以下のサイトを参考に、サイドカー方式でバックエンドアプリケーションへのlogback設定とCDKのコード更新をしてください。
https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch-Application-Signals-Enable-ECSMain.html
https://zenn.dev/ryoyoshii/articles/68c3fa714dacd2
```
:::

Application Signals用に設定する場合は、`trace_id=%X{AWS-XRAY-TRACE-ID}`を設定する必要があります。それ以外はOtelの公式サイトで指定されているものと同様です。

:::details logback.xml

```xml
    <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>%d{HH:mm:ss.SSS} trace_id=%X{AWS-XRAY-TRACE-ID} span_id=%X{span_id} trace_flags=%X{trace_flags} %msg%n</pattern>
            <charset>UTF-8</charset>
        </encoder>
    </appender>
```
:::

環境変数にOTEL関連の設定を追加する必要があります。詳しくは[こちら](https://opentelemetry.io/ja/docs/languages/sdk-configuration/otlp-exporter/)をご参照ください。

:::details CDKのアプリケーションコンテナ環境変数

```ts
    const container = taskDefinition.addContainer(containerName, {
      image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: appName,
        logGroup,
      }),
      environment: {
        SPRING_PROFILES_ACTIVE: "prod",
        DB_URL: `jdbc:mysql://${dbCluster.clusterEndpoint.hostname}:${dbCluster.clusterEndpoint.port}/${config.database.dbName}`,
        OTEL_RESOURCE_ATTRIBUTES: "service.name=todo_app",
        OTEL_LOGS_EXPORTER: "none",
        OTEL_METRICS_EXPORTER: "none",
        OTEL_EXPORTER_OTLP_PROTOCOL: "http/protobuf",
        OTEL_AWS_APPLICATION_SIGNALS_ENABLED: "true",
        JAVA_TOOL_OPTIONS:
          " -javaagent:/otel-auto-instrumentation/javaagent.jar",
        OTEL_AWS_APPLICATION_SIGNALS_EXPORTER_ENDPOINT:
          "http://localhost:4316/v1/metrics",
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: "http://localhost:4316/v1/traces",
        OTEL_TRACES_SAMPLER: "xray",
        OTEL_PROPAGATORS: "tracecontext,baggage,b3,xray",
      },
      secrets: {
        DB_USERNAME: ecs.Secret.fromSecretsManager(
          databaseCredentials,
          "username"
        ),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(
          databaseCredentials,
          "password"
        ),
      },
      essential: true,
    });
```
:::

CWサイドカーの環境変数にトレースを取得し、Application Signalsで収集するように設定をしてあげます。

:::details CDKのCWサイドカー

```ts
    const cloudWatchAgent = taskDefinition.addContainer("CloudWatchAgent", {
      image: ecs.ContainerImage.fromRegistry(
        "public.ecr.aws/cloudwatch-agent/cloudwatch-agent:latest-amd64"
      ),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: "CloudWatchAgent",
        logGroup: new logs.LogGroup(this, "CloudWatchAgentLogGroup", {
          retention: logs.RetentionDays.ONE_WEEK,
        }),
      }),
      environment: {
        CW_CONFIG_CONTENT:
          '{"agent": {"debug": true}, "traces": {"traces_collected": {"application_signals": {"enabled": true}}}, "logs": {"metrics_collected": {"application_signals": {"enabled": true}}}}',
      },
    });
```

:::

これによって、CloudWatch上にサービスが表示されるようになりました。なお、Javaで取得されるランタイムメトリクスは[こちら](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/AppSignals-MetricsCollected.html)で確認できます。

実際にApplication Signalsのページを確認すると、サービスとして検出されていることがわかります。

![](https://storage.googleapis.com/zenn-user-upload/f537e024f5f4-20251004.png)
*Application Signalsのサービスページ*

![](https://storage.googleapis.com/zenn-user-upload/f08b1b35245d-20251004.png)
*サービスの詳細*

![](https://storage.googleapis.com/zenn-user-upload/51365d88fe51-20251004.png)
*ランタイムメトリクス*

![](https://storage.googleapis.com/zenn-user-upload/f8089bfe56a2-20251004.png)
*APIオペレーションごとのサマリ*

一番の推しポイントはランタイムメトリクスが簡単に取得できるところです。JavaのJVMをみたい場合、これまでログから統計情報を取ったりと手間がかかっていましたが、綺麗に可視化までされるので、お困りの方にはピッタリだと思います。

なお、2025/10/2に[Application Map](https://aws.amazon.com/jp/about-aws/whats-new/2025/10/application-map-generally-available-amazon-cloudwatch/)がGAされました。
これまでサービスマップとして提供されていたものが、よりサービスごとにグルーピングされてマイクロサービス的に運用されている方には可視性が上がったのかなと思います。

:::details Application Map

![](https://storage.googleapis.com/zenn-user-upload/6930bf30a1fc-20251004.png)

![](https://storage.googleapis.com/zenn-user-upload/08b37a8012db-20251004.png)

![](https://storage.googleapis.com/zenn-user-upload/28133da139b4-20251004.png)

:::

## Synthetics Canary
外形監視を導入していきます。

こちらの実装も生成AIくんにお願いします。

:::details プロンプト

```
CloudWatch Synthetics Canaryを導入したいです。
対象のドメインはCloudFrontのドメインで、実行間隔は5分起きにしたいです。
CDKのソースコードを修正してください。
```
:::

 Application Signalsに統合するためには、**X-Rayトレースを有効化**しないといけません。
 その部分だけは出力されなかったので、手で追加しました。

 :::details X-Ray統合

 ```ts
     const canary = new synthetics.Canary(this, "Canary", {
      canaryName: `${appName}-canary`,
      runtime: synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_11_0,
      test: synthetics.Test.custom({
        code: synthetics.Code.fromAsset(path.join(__dirname, "canary")),
        handler: "index.handler",
      }),
      schedule: synthetics.Schedule.rate(Duration.minutes(5)),
      environmentVariables: {
        SITE_URL: `https://${distribution.distributionDomainName}`,
      },
      activeTracing: true, // Apprication Insightsと連携するためにX-Rayを有効化
    });
    // CanaryのIAMロールにX-Ray用のポリシーをアタッチ
    canary.role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")
    );
```

 ::::

なお、月間100実行以上はFree Tierを外れるのでご注意ください。また`syn-nodejs-puppeteer-11.0`を使うとトレースが落ちてしまうというバグに当たり、`syn-nodejs-puppeteer-10.0`バージョンダウンしています。

![](https://storage.googleapis.com/zenn-user-upload/42d64b65f013-20251004.png)
*Synthetics Canary実行結果*

![](https://storage.googleapis.com/zenn-user-upload/672e9b01cce2-20251004.png)
*トレースマップ*

Application Signalsのサービスページにも表示されました。

![](https://storage.googleapis.com/zenn-user-upload/882de7d530e3-20251004.png)
*Application Signals*

![](https://storage.googleapis.com/zenn-user-upload/0e56a4f7b0af-20251004.png)
*Application SignalsのSynthetics canaryタブ*


## RUM
最後にフロント画面に対してRUMを導入してみます。

実装はまたまた生成AIくんにお願いします。

:::details プロンプト

```
CloudWatch RUMを導入したいです。
CDKの実装とフロントエンドの実装が必要だと思いますが、まずはCDKの実装をお願いします。フロントエンドの実装は手順を提示してください。
```
:::

フロントエンドの実装はしたことがなかったので、自分で対応できるよう手順だけ提示してもらいました。
まずはRUMを設定し、提示されたコードスニペットをフロントエンドコードに追加するということなので、まずはCDKでRUMを実装していきます。

今回は非認証ユーザーで実行したいので、Cognito IdPoolを作り、ゲストユーザー用のロールに諸々の権限を与えてあげます。

:::details RUMの実装

```ts
    // CloudWatch RUMの作成
    // Create Cognito IdentityPool
    const myIdentityPool = new cognitoidp.IdentityPool(
      this,
      "RumIdentityPool",
      {
        allowUnauthenticatedIdentities: true,
      }
    );
    const unauthenticatedRole = myIdentityPool.unauthenticatedRole;
    const rumApp = new rum.CfnAppMonitor(this, "RumApp", {
      name: `${appName}-rum`,
      appMonitorConfiguration: {
        guestRoleArn: unauthenticatedRole.roleArn,
        identityPoolId: myIdentityPool.identityPoolId,
        enableXRay: true,
        sessionSampleRate: 1,
        telemetries: ["errors", "performance", "http"],
      },
      domain: distribution.distributionDomainName,
      cwLogEnabled: true,
    });
    unauthenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["rum:PutRumEvents"],
        resources: [`arn:aws:rum:${this.region}:${this.account}:appmonitor/*`],
      })
    );
    unauthenticatedRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["logs:PutResourcePolicy"],
        resources: ["*"],
      })
    );
    unauthenticatedRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess")
    );
```

:::

これでCDK上の実装は完了したのでデプロイして、スニペットを取得します。

![](https://storage.googleapis.com/zenn-user-upload/92b5362dae2c-20251004.png)
*コードスニペット*

これをフロントアプリの`App.tsx`に追加します。この時、少しだけ変更が必要です。

telemetriesの設定内で、httpに`addXRayTraceIdHeader:true`を指定しないと、X-Rayトレースが紐付かずに Application Signalsへの連携ができませんでした。

:::details App.tsx抜粋

```ts
    telemetries: [
      "errors",
      "performance",
      [
        "http",
        {
          addXRayTraceIdHeader: true,
        },
      ],
    ],
```

:::

RUM自体のサービスページにうまく表示されていることが確認できます。

:::details RUMのサービスページ

![](https://storage.googleapis.com/zenn-user-upload/f82004b41799-20251004.png)
*ウェブバイタル*

![](https://storage.googleapis.com/zenn-user-upload/7d59d143e7da-20251004.png)
*経時的なページロードのステップ*

:::

Application Signalsのクライアントページにも表示されていることが確認できました。

![](https://storage.googleapis.com/zenn-user-upload/441d515bb9ee-20251004.png)
*Application Signalsのクライアントページ*


## まとめ
これによって、SPAアプリケーションにおけるモニタリングがObserverbilityを持って、AWS内で実現できるようになりました。

これまでサービス概要は認識していましたが、きちんと導入方法まで理解を深められたので、とても良い経験になりました。また、生成AIのコーディングエージェントの凄みやサポート力を体感できたのも最高でした。

やはり、AWS内だけでホストしているアプリケーションに対してAWS内でObserverbilityが実現できるApplication Signalsは強力ですし、導入ハードルも低いのでぜひ検討してほしいサービスだなと感じました。

今回はSLI/SLOの設定やアラームの設定はしていませんが、複雑な設定もなくサービスに適切なSLOを設定することで、無駄なアラームを減らしつつ開発に専念できる状態を作り出すことが可能です。後日その辺りもまとめられたらなと思っています。


そして、この記事を書いている間に、[ECS Managed Instanceがリリース](https://aws.amazon.com/jp/blogs/aws/announcing-amazon-ecs-managed-instances-for-containerized-applications/)され、[CDK L2コンストラクトもリリース](https://x.com/365_step_tech/status/1973589355651539103)されたので、引き続きこの辺りを取り込んでいきたいなと思います。

この記事のリポジトリを公開しました。

https://github.com/nnydtmg/todo-sample
