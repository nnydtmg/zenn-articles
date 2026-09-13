---
title: "Nx Plugin for AWS を Terraform で使ってみた 〜インフラ寄りの人向けの Nx 入門つき〜"
emoji: "🧩"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","terraform","nx","typescript","iac"]
published: false
---
# はじめに
みなさん、`Nx` って触ったことありますか？

私は正直、「フロントエンドのモノレポでよく聞くやつ」くらいの認識で、自分から触りにいったことはありませんでした。。

そんな中、2026年9月に AWS から **Nx Plugin for AWS 1.0** が公開されました。

https://aws.amazon.com/about-aws/whats-new/2026/09/nx-plugin-for-aws/

ジェネレータでフルスタックアプリの雛形を一気に作れる、というツールなのですが、リリース記事やブログを読んでいて一番私が引っかかったのがここでした。

> defining infrastructure as either AWS Cloud Development Kit (AWS CDK) constructs or Terraform modules

**インフラを CDK でも Terraform でも書ける**、と書いてあるんですね。

日本語の紹介記事も含めて、出てくる例はほぼ CDK なのですが、私は業務で Terraform を書くことのほうが多いです。「Terraform を選んだときにどこまで同じ体験になるのか」がどうしても気になったので、実際に手を動かして検証してみました。

:::message
この記事は、`Nx 23.2.0` / `@aws/nx-plugin 1.0.0` / `Terraform 1.14.5` / AWS provider `6.63.0` で検証した内容がベースです。バージョンが上がると生成物は変わる可能性があるので、その点はご承知おきください。
:::

検証に使ったリポジトリは公開していないのですが、実際に動かしたコードはこの記事の中に載せていきます。

記事の流れはこんな感じです。インフラ寄りの方に読んでいただきたいので、**そもそも Nx が何なのか**にページを割いています。

1. Nx Plugin for AWS 1.0 のリリース紹介
2. そもそも Nx とは何なのか（インフラ寄りの人向け）
3. Terraform で使うにはどうするのか
4. 実際に使ってみて感じたメリット
5. ハマったところ・注意点

# 1. Nx Plugin for AWS 1.0 とは
まずはリリースの話からです。

https://github.com/awslabs/nx-plugin-for-aws

`@aws/nx-plugin` は、**AWS 上のアプリケーションを作るためのコードジェネレータ集**です。Apache 2.0 の OSS として `awslabs` 配下で公開されています。AWS Open Source Blog でも紹介されています。

https://aws.amazon.com/blogs/opensource/build-full-stack-aws-applications-in-minutes-with-ai-powered-scaffolding/

ざっくり特徴を挙げるとこのあたりかと思います。

- **30 種類以上のジェネレータ**。TypeScript / Python / React に対応していて、API（tRPC / FastAPI / Smithy）、DynamoDB、RDB、React サイト、Lambda、MCP サーバー、Bedrock AgentCore 上の AI エージェントまで揃っています
- **インフラは CDK コンストラクト or Terraform モジュール**として生成される。WAF、CloudWatch へのアクセスログ、X-Ray トレースといった推奨構成が最初から入っています
- **生成されたコードは自分のもの**。プラグインへのランタイム依存がないので、生成後に好きなだけ手を入れられます。あとからプラグイン側の改善を取り込みたいときは Nx の migration を使う、という設計です
- **`connection` ジェネレータ**でプロジェクト同士を繋ぐと、型安全なクライアントが生成される。API の破壊的変更が「本番でのリクエスト失敗」ではなく「ビルドエラー」になります
- **MCP サーバー（`@aws/nx-plugin-mcp`）が同梱**されていて、AI コーディングエージェントからジェネレータを呼べます

私が「これは良さそうだな」と思ったのは4つ目です。フロントとバックエンドの繋ぎ込みって、結局どこかで型が切れて事故るポイントだと思っているので、そこをビルドエラーに落としてくれるのはありがたいです。

CDK 版の解説は AWS Japan の記事がとても分かりやすかったので、まずこちらを読まれるのをおすすめします。

https://zenn.dev/aws_japan/articles/nx-plugin-for-aws-nx-explained

この記事は、その裏返しで **「じゃあ Terraform だとどうなるの？」** をやってみた、という位置づけです。

# 2. そもそも Nx とは（インフラ寄りの人向け）
ここが一番書きたかったところです。

「Nx Plugin for AWS がすごい」という話をするには、まず Nx を分かっている必要があるのですが、インフラ側の人間だと Nx に触れる機会がそもそも少ないと思っています。私もそうでした。

## Nx は「モノレポ用のビルドシステム」
Nx を一言でいうと、**1つのリポジトリに複数のプロジェクトが入っている状態を、まともに扱えるようにする仕組み**です。

これ、実は Terraform を書いている人にはかなり馴染みのある話だと思っています。対応づけるとこんな感じです。

| Nx の概念 | Terraform でいうと | 説明 |
| --- | --- | --- |
| プロジェクト（project） | ルートモジュール / 再利用モジュール | ビルドやテストの単位。1ディレクトリ1プロジェクト |
| ターゲット（target） | `terraform plan` / `apply` などの操作 | プロジェクトに対して実行できるコマンドの定義 |
| プロジェクトグラフ | `module` の依存関係 | 誰が誰に依存しているかのグラフ |
| `nx affected` | 変更したモジュールに依存するものだけ `plan` | 影響範囲だけを再実行する |
| キャッシュ | （相当するものはない） | 入力が変わっていなければ実行そのものをスキップ |
| ジェネレータ | `terraform init -from-module` 的な雛形生成 | 規約に沿ったコードを生成する |

特にインフラの人に刺さるのは、下の3つだと思います。

**プロジェクトグラフ**は、Terraform で `module "vpc"` と `module "eks"` があって EKS が VPC の出力を参照している、というあの関係を、リポジトリ全体（TypeScript も Terraform も含めて）に広げたものです。

**`nx affected`** は、そのグラフを使って「今回の変更で影響を受けるプロジェクトだけ」を選んでビルド・テストします。CI で全部の `plan` を回して10分待つ、みたいな状況を避けられます。

**キャッシュ**は、入力（ソースファイル、依存プロジェクトの成果物、環境変数など）のハッシュが前回と同じなら、コマンドを実行せずに前回の結果を復元する仕組みです。これが効くと、2回目以降の `nx build` がほぼ一瞬で終わります。

## ジェネレータは「scaffolding」
そしてもう一つが**ジェネレータ**です。

```sh
pnpm nx g @aws/nx-plugin:ts#api organizer-api --framework=trpc --auth=iam --infra=rest-lambda
```

こういうコマンドを打つと、API のコード・テスト・ビルド設定・そして **Terraform モジュール**までが、規約に沿った形で生成されます。

インフラ屋的な言い方をすると、**「社内のよくできた Terraform モジュール置き場と、それを呼び出す雛形ジェネレータが公式から降ってきた」** という理解が近いかなと思っています。

## ここが本題：Terraform も Nx のプロジェクトになる
で、ここからが Terraform 使いにとっての本題です。

Nx Plugin for AWS には `terraform#project` というジェネレータがあり、**Terraform のルートモジュールも再利用モジュールも、Nx のプロジェクトとして登録できます**。

つまり、

- TypeScript のドメインロジックを変えた
- → それを使う Lambda のバンドルが変わる
- → そのバンドルを zip 化してデプロイする Terraform の `plan` をやり直すべき

という判断を、**Nx が依存グラフから自動でやってくれる**ということです。これが今回一番「おっ」と思ったところでした。

<!-- TODO: `pnpm nx graph` の依存グラフ画面のスクリーンショット -->

# 3. Terraform で使うには
ここから実際の手順です。

## 3-1. ワークスペースを作るときに `--iac=terraform` を指定する
これだけです。

```sh
pnpm create @aws/nx-workspace nx-plugin-demo --iac=terraform --containers=infer
cd nx-plugin-demo
```

すると、リポジトリ直下に設定ファイルが1つできます。

```ts:aws-nx-plugin.config.mts
import { AwsNxPluginConfig } from '@aws/nx-plugin';

export default {
  iac: { provider: 'terraform' },
  containers: { engine: 'docker' },
  packageManager: { catalogs: true },
} satisfies AwsNxPluginConfig;
```

**`iac.provider` の1行がすべて**です。これ以降、各ジェネレータに `--iac` を付けなくても、Terraform モジュールが生成されるようになります。

:::message
既存のワークスペースでも、この設定ファイルを書き換えれば切り替わります。ただし**すでに生成済みの CDK コンストラクトが Terraform に変換されるわけではない**ので、途中で乗り換えるのは現実的ではないと思います。最初に決めておくのが良さそうです。
:::

## 3-2. ジェネレータでプロジェクトを積んでいく
今回は題材として、社内勉強会の受付・チェックインシステムを作りました。運営用と参加者用で API を分けて、ドメインロジックを共有する、という「モノレポにする意味がある」構成にしています。

実際に叩いたコマンドがこちらです。

```sh
# 共有ドメインライブラリ
pnpm nx g @aws/nx-plugin:ts#project domain

# DynamoDB（単一テーブル + ElectroDB）
pnpm nx g @aws/nx-plugin:ts#dynamodb event-store --framework=electrodb --infra=dynamodb

# tRPC API を2つ（IAM 認証 / API Gateway REST + Lambda）
pnpm nx g @aws/nx-plugin:ts#api organizer-api --framework=trpc --auth=iam --infra=rest-lambda --integrationPattern=isolated
pnpm nx g @aws/nx-plugin:ts#api attendee-api  --framework=trpc --auth=iam --infra=rest-lambda --integrationPattern=isolated

# 非同期ワーカー（DynamoDB Streams を購読する Lambda）
pnpm nx g @aws/nx-plugin:ts#project workers
pnpm nx g @aws/nx-plugin:ts#lambda-function --project=workers --name=checkin-projector \
  --event=DynamoDBStreamSchema --infra=lambda

# React ポータル + Cognito 認証
pnpm nx g @aws/nx-plugin:ts#website portal --ux=shadcn --tailwind=true --tanstackRouter=true --infra=cloudfront-s3
pnpm nx g @aws/nx-plugin:ts#website#auth --project=portal --allowSignup=false

# プロジェクト間の接続（型安全なクライアントが生成される）
pnpm nx g @aws/nx-plugin:connection --sourceProject=portal        --targetProject=organizer-api
pnpm nx g @aws/nx-plugin:connection --sourceProject=portal        --targetProject=attendee-api
pnpm nx g @aws/nx-plugin:connection --sourceProject=organizer-api --targetProject=event-store
pnpm nx g @aws/nx-plugin:connection --sourceProject=attendee-api  --targetProject=event-store

# Terraform プロジェクト（ルートモジュール + 再利用モジュール）
pnpm nx g @aws/nx-plugin:terraform#project infra      --type=application
pnpm nx g @aws/nx-plugin:terraform#project ops-alarms --type=library
```

ここで確認できたのが、**今回使ったジェネレータはすべて Terraform で一貫して動いた**ということです。`ts#api` / `ts#website` / `ts#website#auth` / `ts#dynamodb` / `ts#lambda-function` / `connection` のどれも、CDK コンストラクトの代わりに Terraform モジュールを吐いてくれました。

「Terraform 対応は一部のジェネレータだけで、結局 CDK に戻ることになるんじゃないか」と少し疑っていたのですが、そこは杞憂でした。

## 3-3. 生成されるもの：`packages/common/terraform`
CDK 版で `packages/common/constructs` にコンストラクトが溜まっていくのと同じように、Terraform 版では `packages/common/terraform` に**モジュールが vendoring されていきます**。

```
packages/common/terraform/src/
  core/                       汎用モジュール
    api/rest-api/             API Gateway REST + アクセスログ + WAF
    dynamodb/                 DynamoDB テーブル（KMS 暗号化 / PITR / 削除保護）
    static-website/           S3 + CloudFront + WAF
    user-identity/            Cognito User Pool / Identity Pool
    asset-bucket/             Lambda の zip を置く S3
    runtime-config/           AppConfig でデプロイ時の値を受け渡す
  app/                        ジェネレータが作った「このアプリ専用」のモジュール
    apis/organizer-api/
    apis/attendee-api/
    dynamodb/event-store/
    lambda-functions/workers-checkin-projector/
    static-websites/portal/
```

`core` が「汎用パーツ」、`app` が「そのパーツをこのアプリ用に設定したラッパー」という二層構造になっています。私たちが普段書く Terraform でも、`modules/` と `envs/` を分けたりしますが、感覚としてはそれに近いです。

そして重要なのが、**これらは生成された時点で自分のリポジトリのコード**だということです。npm パッケージとして参照しているわけではないので、中身を読むこともできますし、手を入れることもできます（後述しますが、実際に手を入れる場面はありました）。

## 3-4. ルートモジュールを書く
ジェネレータが作ってくれるのは部品までで、**それをどう組み合わせるかはルートモジュール（`packages/infra/src/main.tf`）に自分で書きます**。ここは CDK 版で `main.ts` にコンストラクトを並べるのと同じ作業量でした。

たとえば API はこう呼びます。

```hcl:packages/infra/src/main.tf
module "organizer_api" {
  source = "../../common/terraform/src/app/apis/organizer-api"

  asset_bucket_name         = module.asset_bucket.bucket_name
  appconfig_application_id  = module.runtime_config.application_id
  appconfig_application_arn = module.runtime_config.application_arn

  additional_iam_policy_statements = local.table_access_statements
}
```

ポイントは `additional_iam_policy_statements` です。CDK 版で

```ts
table.grantReadWriteData(fn);
```

と書いていた部分が、Terraform 版では **IAM ステートメントを変数として渡す**形になります。

```hcl:packages/infra/src/main.tf
locals {
  table_access_statements = [
    {
      Effect = "Allow"
      Action = [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query",
        # ...
      ]
      Resource = [
        module.event_store.table_arn,
        "${module.event_store.table_arn}/index/*",
      ]
    },
    {
      Effect = "Allow"
      Action = ["kms:Decrypt", "kms:GenerateDataKey*", /* ... */]
      Resource = compact([module.event_store.kms_key_arn])
    },
  ]
}
```

`grantReadWriteData()` の一行と比べると記述量は増えます。ただ、**どの権限を付けたのかが目に見える**ので、私はこっちのほうが好みでした（ここは完全に好みの問題だと思います）。KMS キーへの権限を自分で書くことになるのも、暗号化されたテーブルを扱っている自覚が持てて悪くないなと。

## 3-5. runtime config だけは「宣言の順番」に約束がある
ここは CDK 版との明確な差分なので、独立して書いておきます。

Nx Plugin for AWS には **runtime config** という仕組みがあります。API の URL、Cognito の設定、DynamoDB のテーブル名といった「デプロイしてみないと決まらない値」を、AWS AppConfig 経由でアプリに渡すものです。フロントには `runtime-config.json` として配信されます。

CDK 版では `RuntimeConfig.ensure(this).set(...)` というシングルトンで、どこから書いても勝手に集約されます。一方 Terraform 版は、**ルートモジュールの中で順番を守って宣言する**必要がありました。

```hcl:packages/infra/src/main.tf
# 先頭：値を書き込む全モジュールが、この ID を必要とする
module "runtime_config" {
  source = "../../common/terraform/src/core/runtime-config/appconfig"

  application_name = "${local.name_prefix}-runtime-config"
}

# ...（API / DynamoDB / Cognito などが値を書き込む）...

# 末尾：全エントリが出揃ってからデプロイする
module "runtime_config_deployment" {
  source = "../../common/terraform/src/core/runtime-config/appconfig-deployment"

  application_id            = module.runtime_config.application_id
  environment_id            = module.runtime_config.environment_id
  deployment_strategy_id    = module.runtime_config.deployment_strategy_id
  configuration_profile_ids = module.runtime_config.configuration_profile_ids
  namespaces                = module.runtime_config.namespaces

  depends_on = [
    module.user_identity,
    module.event_store,
    module.organizer_api,
    module.attendee_api,
  ]
}
```

`depends_on` を明示的に書かないと、値が揃う前にデプロイが走ってしまいます。Terraform を書いている人なら「まあそうなるよね」という話だと思いますが、CDK 版のドキュメントを読んでからこちらに来ると引っかかるポイントかと思います。

## 3-6. Nx のターゲットとして `plan` / `apply` が生える
ここがかなり気持ち良かった部分です。

`terraform#project` で生成したプロジェクトには、Terraform の操作が **Nx のターゲット**として定義されます。

| ターゲット | 実際に走るコマンド | 備考 |
| --- | --- | --- |
| `bootstrap` | tfstate 用の S3 バケットを作成 | CDK の `cdk bootstrap` 相当。アカウント × リージョンで1回だけ |
| `format` | `terraform fmt -check -diff` | `--configuration=fix` で自動修正 |
| `validate` | `terraform init -backend=false` → `terraform validate` | AWS 認証情報が不要 |
| `test` | `terraform init -backend=false` → `terraform test` | `.tftest.hcl` によるネイティブテスト |
| `checkov` | `uvx --from checkov==3.3.16 checkov` | セキュリティスキャン |
| `assemble` | Lambda / フロントの成果物を集める | `plan` の前に必要 |
| `plan` | `terraform plan -out=dist/.../dev.tfplan` | `init` / `validate` / `assemble` に依存 |
| `apply` | 保存した tfplan を適用 | `plan` に依存 |
| `output` | `terraform output -json` | |
| `destroy` | `terraform destroy` | |

なので、普段の操作はこうなります。

```sh
pnpm nx plan infra      # init → validate → assemble → plan
pnpm nx apply infra     # plan に依存しているので、これ単体でも通る
pnpm nx output infra
```

`dependsOn` が効いているので、**「build を忘れたまま apply して、古い Lambda の zip がデプロイされる」という事故が構造的に起きない**のがとても良いです。Lambda のバンドルは `dist/packages/*/bundle` に出て、Terraform がそれを zip 化してアップロードするので、apply の前に build が必要なんですね。ここを人間の記憶に頼らなくていいのは助かります（本当に助かる）。

環境の切り替えは `--configuration` です。

```sh
pnpm nx plan infra --configuration=prod
```

`packages/infra/src/env/<env>.tfvars` と `project.json` の設定を足せば環境を増やせる、という素直な作りになっています。

ちなみに backend の設定はこうなっていました。DynamoDB のロックテーブルではなく `use_lockfile`（S3 ネイティブロック）を使っているのが今風ですね。

```hcl:packages/infra/src/providers.tf
terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.63.0"
    }
  }

  backend "s3" {
    encrypt      = true
    use_lockfile = true
  }
}
```

## 3-7. 自作モジュールも Nx プロジェクトにできる
`terraform#project --type=library` で作ったプロジェクトは、**自分で書く再利用モジュール**の置き場になります。

今回は Lambda のエラー / スロットリングを監視する CloudWatch アラームのモジュールを作ってみました。

```hcl:packages/ops-alarms/src/main.tf
variable "function_names" {
  description = "Lambda function names to watch, keyed by a stable label used in the alarm name."
  type        = map(string)
}

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = var.function_names
  # ...
}
```

これをルートモジュールから**相対パスで**呼びます。

```hcl:packages/infra/src/main.tf
module "ops_alarms" {
  source = "../../ops-alarms/src"

  name_prefix = local.name_prefix

  function_names = merge(
    { for op, name in module.organizer_api.lambda_function_names : "organizer-${op}" => name },
    { for op, name in module.attendee_api.lambda_function_names  : "attendee-${op}"  => name },
    { "checkin-projector" = module.checkin_projector.function_name },
  )
}
```

**この `source = "../../ops-alarms/src"` を、Nx がプロジェクト依存として認識します。**

つまり `ops-alarms` を書き換えると `infra` のキャッシュが無効化されて、`nx affected` が `infra` を選んでくれる。Terraform のモジュール依存が、そのまま Nx の依存グラフに載るということです。ここは素直に良くできているなと感じました。

`terraform test` も書けます。`mock_provider` を使えば AWS 認証情報なしで通るので、CI に置きやすいです。

```hcl:packages/ops-alarms/src/main.tftest.hcl
mock_provider "aws" {}

variables {
  name_prefix = "eventdesk-test"
  function_names = {
    organizer = "eventdesk-organizer-api"
    attendee  = "eventdesk-attendee-api"
  }
}

run "creates_error_and_throttle_alarms_per_function" {
  command = plan

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.lambda_errors) == 2
    error_message = "Expected one error alarm per watched function"
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.lambda_errors["organizer"].alarm_name == "eventdesk-test-organizer-errors"
    error_message = "Alarm names must be prefixed so several environments can coexist"
  }
}
```

# 4. デプロイしてみる
実際にデプロイする流れです。

<!-- TODO: このセクションは実際に apply したときの出力・画面に合わせて本文を調整する -->

## 4-1. リモートステートの用意（初回のみ）
```sh
pnpm nx bootstrap infra
```

tfstate 用の S3 バケットを作ります。アカウント × リージョンごとに1回だけでよい操作です。対象アカウントは AWS SDK の認証情報チェーンから解決されるので、実行前に `aws sts get-caller-identity` で意図したアカウントかを必ず確認してください。

<!-- TODO: bootstrap 実行時のターミナル出力 / 作成された S3 バケットのマネジメントコンソール画面 -->

## 4-2. ビルド
```sh
pnpm build
```

これ1発で、Biome の lint、`terraform fmt`、TypeScript のコンパイル、単体テスト、`terraform validate` / `terraform test`、Checkov のスキャンまで通ります。

<!-- TODO: pnpm build の実行結果（Nx のターゲット実行サマリ）のスクリーンショット -->

## 4-3. 差分確認とデプロイ
```sh
pnpm nx plan infra
pnpm nx apply infra
```

<!-- TODO: nx plan の出力（作成されるリソース数のサマリ部分）のスクリーンショット -->

<!-- TODO: nx apply 完了後のターミナル出力と、出力される website_url / user_pool_id などの outputs -->

完了すると `pnpm nx output infra` で CloudFront の URL や Cognito の User Pool ID が取れます。

<!-- TODO: デプロイされたリソースのマネジメントコンソール画面（CloudFormation ではなくリソース個別。API Gateway / Lambda / DynamoDB / CloudFront あたり） -->

## 4-4. 動作確認
セルフサインアップは無効で生成しているので、確認用ユーザーは管理者が作ります。

```sh
aws cognito-idp admin-create-user \
  --user-pool-id <user_pool_id> \
  --username <username> \
  --user-attributes Name=email,Value=<email> Name=email_verified,Value=true \
  --temporary-password '<temporary password>' \
  --message-action SUPPRESS
```

<!-- TODO: デプロイされたポータルのサインイン画面 -->

<!-- TODO: イベント作成 → 公開 → 参加者が申込 → 受付でチェックイン、の一連の画面 -->

<!-- TODO: チェックイン後に集計が反映された画面（DynamoDB Streams 経由なので数秒遅れて反映される） -->

## 4-5. 後片付け
```sh
pnpm nx destroy infra           # リソースの削除
pnpm nx bootstrap-destroy infra # tfstate バケットの削除（destroy 後に）
```

:::message alert
**DynamoDB テーブルと Cognito User Pool は、そのままだと `destroy` が失敗します。**
生成されるモジュールは `deletion_protection_enabled = true`（DynamoDB 側）と `lifecycle { prevent_destroy = true }`（Terraform 側）の**二重**で守られているためです。意図して消す場合は、生成モジュール側の `lifecycle` ブロックを外して、ルートモジュールから `deletion_protection_enabled = false` を渡してから再実行する必要があります。
検証用アカウントで試すときは、ここを知らないと「消えない」と焦ると思うので、先に書いておきます。
:::

# 5. 実際に使ってみて感じたメリット
ここまでやってみて、Terraform で使う場合のメリットを整理します。

## 5-1. `nx affected` がインフラまで効く
これが最大だと思っています。

今回の構成だと、`packages/domain` の業務ルールを2つの API とワーカーとフロントが参照していて、そのすべてを `packages/infra` がデプロイします。なので、

- **ドメインを1行変える** → 2 API + ワーカー + フロント + infra が再検証対象になる
- **UI だけ変える** → フロントと infra だけ

という粒度で `pnpm nx affected --target build` が効きます。

Terraform 単体でも「変更したディレクトリだけ CI を回す」ことはできますが、**アプリ側の TypeScript の変更が Terraform の再検証に繋がる**のは、グラフを持っている Nx ならではだなと感じました。ここを自前の CI スクリプトで組もうとすると、だいたい破綻するので。。

## 5-2. Terraform の品質ゲートが最初から揃っている
`fmt` / `validate` / `test` / `checkov` が、**生成時点で Nx ターゲットとして定義済み**です。

Checkov は生成モジュール込みで **211 リソース / failed 0**（skip 55）で通りました。ゼロから Terraform を書き始めると、この手のスキャンを入れるのは後回しになりがちだと思うので、最初から通る状態で始められるのは大きいです。

<!-- TODO: checkov の実行結果（passed/failed のサマリ部分）のスクリーンショット -->

`terraform test` もテンプレートがあるので、「モジュールにテストを書く」習慣に入りやすいです。

## 5-3. CDK 版との対応が素直
検証しながら作った対応表です。CDK 版の情報を読みながら Terraform で実装するときに便利だと思うので、置いておきます。

| CDK 版 | Terraform 版 |
| --- | --- |
| `packages/common/constructs` | `packages/common/terraform` |
| `ts#infra`（CDK App） | `terraform#project --type=application` |
| `nx bootstrap infra`（CDK Bootstrap） | `nx bootstrap infra`（tfstate 用 S3 バケット作成） |
| `nx deploy-sandbox infra` | `nx apply infra`（`plan` に依存） |
| `nx destroy-sandbox infra` | `nx destroy infra` |
| `RuntimeConfig.ensure(this).set(...)` | `core/runtime-config/entry` モジュール |
| `table.grantReadWriteData(fn)` | `additional_iam_policy_statements` に IAM ステートメントを渡す |

## 5-4. AI コーディングエージェントとの相性が良い
ワークスペースを生成した時点で、Claude Code / Codex / Cursor / Kiro / Gemini CLI / GitHub Copilot 向けの **MCP サーバー設定がすでに入っています**（`.mcp.json` など）。いずれも `npx -y @aws/nx-plugin-mcp` を起動する設定です。

これが入っていると、エージェントに

```
Nx Plugin for AWS のジェネレータを使って、通知用の Lambda プロジェクトを追加して。
IaC は Terraform。
```

と投げるだけで、**使えるジェネレータとそのオプションを MCP 経由で調べたうえで `nx g` を実行してくれます**。エージェントに一から Terraform を書かせるより、ジェネレータを呼ばせたほうが圧倒的に安定するので、これはかなり実用的だと感じました。

# 6. ハマったところ・注意点
良いところばかり書くのもフェアではないので、詰まったところも正直に書いておきます。

## 6-1. `terraform fmt` が再帰しない
`packages/common/terraform` の `format` ターゲットは、`src` 直下で `terraform fmt -check -diff` を実行するだけでした。`terraform fmt` は**デフォルトで非再帰**なので、モジュール本体がある `src/app/**` と `src/core/**` が lint 対象から外れます。

実際、生成物の中に未フォーマットのファイルがありました。`-recursive` を足して直しています。

## 6-2. `build` に `validate` が入っていない
生成時点の `build` が呼ぶのは `format` / `checkov` / `test` だけで、**`validate` は `plan` からしか呼ばれません**。

変数名や出力名の参照ミスは `validate` でしか捕まらないので、私は `build` の `dependsOn` に足しました。

```json:packages/infra/project.json
"build": {
  "dependsOn": [
    "format",
    "validate",
    "checkov",
    "test",
    "@nx-plugin-demo/terraform:build"
  ]
},
```

`test` がすでに `terraform init -backend=false` を実行しているので、**ネットワーク要件は変わりません**（どちらも Terraform Registry への到達性が必要）。ここを足しておくと `pnpm build` の安心感がかなり上がります。

なお `validate` を全体に回した結果は、ルートモジュール + 生成モジュール10個 + 自作モジュールまで含めて `Success!` でした。参照ミスはゼロです。

## 6-3. 生成モジュールに手を入れる場面はある
今回は DynamoDB Streams を使いたかったのですが、**生成される `core/dynamodb` モジュールはストリームに未対応**でした。なので `stream_enabled` / `stream_view_type` 変数と `table_stream_arn` 出力を自分で足しています。

```hcl:packages/infra/src/main.tf
module "event_store" {
  source = "../../common/terraform/src/app/dynamodb/event-store"

  # Streams は生成モジュールへの追加（core/dynamodb/dynamodb.tf を参照）
  stream_enabled = true
}
```

ストリームを購読する `aws_lambda_event_source_mapping` のほうは、生成物を汚さないようルートモジュール側に書きました。

```hcl:packages/infra/src/main.tf
resource "aws_lambda_event_source_mapping" "registrations" {
  event_source_arn                   = module.event_store.table_stream_arn
  function_name                      = module.checkin_projector.function_arn
  starting_position                  = "LATEST"
  batch_size                         = 25
  maximum_batching_window_in_seconds = 5

  depends_on = [module.checkin_projector]

  filter_criteria {
    filter {
      pattern = jsonencode({
        dynamodb = { NewImage = { __edb_e__ = { S = ["registration"] } } }
      })
    }
  }
}
```

:::message
**生成物に手を入れたら、必ずどこかに記録を残すことをおすすめします。**
`packages/common/terraform` はジェネレータの出力なので、再生成や migration で上書きされる可能性があります。私は README に「生成モジュールへの追加変更」というセクションを作って、変更した箇所と理由を全部書くルールにしました。
「生成されたコードは自分のもの」というのは自由度が高い反面、**どこを触ったか分からなくなると migration で詰む**ので、ここは運用でカバーするしかないかなと思っています。
:::

## 6-4. AWS プロバイダ 6.x の deprecation 警告
生成物の中に `data.aws_region.current.id` を使っている箇所があり、AWS プロバイダ 6.x では非推奨（`.region` を使う）で警告が3件出ました。

面白いことに、**同じファイルの他の箇所はすでに `.region` に直っていて、一部だけ取り残されている**状態でした。バージョンが上がれば直ると思いますが、`validate` を通したときに警告が出ても慌てなくて大丈夫です。

## 6-5. 隔離環境だと `registry.terraform.io` の許可が要る
これは Terraform を使う以上どうしようもない話ですが、`validate` も `test` も内部で `terraform init` を走らせるため、**Terraform Registry に到達できないと何も実行できません**。

Claude Code のクラウド環境のように送信先ドメインが制限された環境で動かす場合は、`registry.terraform.io`（と、バージョン確認用の `checkpoint-api.hashicorp.com`）の許可が必要でした。プロバイダのバイナリ自体は `releases.hashicorp.com` から来るので、追加が必要なのはこの2つだけです。

:::details Terraform バイナリ自体も入っていない場合
Claude Code のクラウド環境には `terraform` バイナリがプリインストールされていませんでした。Node / pnpm / uv / docker クライアントは入っています。

```sh
curl -sSL -o /tmp/tf.zip https://releases.hashicorp.com/terraform/1.14.5/terraform_1.14.5_linux_amd64.zip
unzip -o -q /tmp/tf.zip -d /tmp && install -m755 /tmp/terraform /usr/local/bin/terraform
terraform --version
```
:::

## 6-6. `.terraform.lock.hcl` はコミットして良い
`validate` / `test` が `terraform init` を走らせるので、初回実行後に `.terraform.lock.hcl` が未追跡ファイルとして現れます。ジェネレータは `init` を一度も通していない状態のリポジトリを作るんですね。

Terraform の推奨どおりコミットして問題ありませんでした。プラットフォーム依存も心配していたのですが、レジストリ経由で入れたロックファイルには署名付きチェックサム（`zh:`）が全プラットフォーム分記録されるので、Linux で生成したものでも macOS の `init` は通ります。

とはいえ明示しておくほうが確実なので、4プラットフォーム分を記録した状態でコミットしました。

```sh
cd packages/infra/src
terraform providers lock \
  -platform=linux_amd64 -platform=linux_arm64 \
  -platform=darwin_arm64 -platform=darwin_amd64
```

## 6-7. `packages/common/terraform` の `validate` / `test` は実質ノーオペ
細かい話ですが、`packages/common/terraform` の `src` 直下には `.tf` が1つもありません（モジュールは `src/app/**` と `src/core/**` にあります）。なので `terraform validate` は空ディレクトリを見て `Success!` を返してしまいます。

実際の検証カバレッジは `infra:validate` 側から来ています（ルートモジュールが参照するモジュールは、モジュールツリーを辿って検証されるため）。この経路で唯一届かなかったのは、どこからも参照していない `core/asset-ecr` だけでした。

`fmt` が `-recursive` を必要としたのと同じ、**「ターゲットが `src` 直下しか見ない」問題**ですね。気になる方はモジュールごとに回す形に変えると良いと思います。

# 最後に
Terraform で Nx Plugin for AWS を使ってみて、**「Terraform は一級市民として扱われている」**というのが率直な感想です。

一部のジェネレータだけ対応、みたいな中途半端な状態を予想していたのですが、今回使った範囲では一貫して Terraform モジュールが出てきましたし、`plan` / `apply` / `validate` / `test` / `checkov` が Nx のターゲットとして揃っているので、Terraform 側の開発体験も素直に良かったです。

そして何より、**アプリケーションのコード変更が Terraform の再検証に繋がる**という体験は、Terraform 単体では得られないものでした。モノレポでアプリとインフラを一緒に持っている（あるいはこれから持ちたい）チームには、かなり刺さるんじゃないかと思っています。

一方で、生成物に手を入れる場面は確実にあるので、**どこを触ったかを記録する運用**はセットで考えておいたほうが良さそうです。ここが migration との付き合い方に直結すると思っています。

今回試せていないところもまだあります。

- `ts#agent` / `py#api` など、他のジェネレータの Terraform 対応状況
- CI（`nx affected` ベース）での `plan` 実行と、`apply` の手動承認フロー
- カスタムドメイン（`custom_domain_names` / `acm_certificate_arn`）と WAF の有効化
- 環境を増やしたとき（`prod` 追加）の state 分離

このあたりは試したらまた記事にしたいと思います。

CDK を使っている方の記事はどんどん出てきていますが、Terraform 側の情報はまだ少ないので、この記事が「Terraform でも行けるんだ」と思ってもらえるきっかけになれば嬉しいです。もし実際に試されて「うちではこうしている」「ここはこう書いたほうが良い」といった話があれば、ぜひ教えていただけると嬉しいです！

ここまで読んでいただき、ありがとうございました。
