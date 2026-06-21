---
title: "2026年版・AWSでOpenTelemetryを始めるなら——CloudWatch OTLP直接/Collector経由/カスタムCollectorの選び方"
emoji: "🔭"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws", "opentelemetry", "cloudwatch", "observability", "otel"]
published: false
---

:::message
この記事は、これから AWS に OpenTelemetry を導入する人が「自分の状況でどの構成を選ぶか」を判断できるようにするための整理ガイドです。手順を一行ずつ追うハンズオンではなく、3つの構成パターンの違いと、公式ドキュメントで裏取りした設定サンプルを並べて比較します。
:::

## この記事でわかること

- CloudWatch OTLP 直接送信と Collector 経由の違い
- どの構成を、どんな条件で選ぶべきか
- 導入前に知っておくべき制約・コスト・落とし穴

## ミニ用語表

| 用語 | 意味 |
| --- | --- |
| OTel（OpenTelemetry） | アプリからトレース・メトリクス・ログを出すための標準仕様と実装群 |
| OTLP | OTel のデータ送信プロトコル |
| ADOT | AWS が提供する OpenTelemetry ディストリビューション（SDK と Collector） |
| Collector | アプリとバックエンドの間でテレメトリを集約・加工・転送するコンポーネント |
| Application Signals | CloudWatch の APM 機能。サービス検出・サービスマップ・SLO を提供 |

## はじめに：選択肢が増えて、むしろ迷うようになった

少し前まで、「AWS で OpenTelemetry をやる」と言えば答えはほぼ一つでした。ADOT の Collector を立て、X-Ray と CloudWatch に送る。それ以外の道は事実上なかったのです。

ところが状況は変わりました。CloudWatch が **トレース・ログ・メトリクスの3シグナルすべてを OTLP で直接受信できる** ようになり、Collector を一切挟まずに送るという選択肢が現実的になりました。トレース／ログについては Transaction Search の提供（2024年11月）で OTLP エンドポイント経由の取り込みが可能になり[^update-txsearch]、メトリクスも 2026年4月に OTLP 直接取り込みが追加されました（執筆時点ではプレビュー）[^update-otlp-metrics]。これによって CloudWatch はオブザーバビリティの三本柱をオープン標準のプロトコル一本で受けられるようになっています。

[^update-txsearch]: アップデート: [Amazon CloudWatch launches full visibility into application transactions（AWS What's New, 2024-11）](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-cloudwatch-visibility-application-transactions/)。Transaction Search の提供により、トレース用 OTLP エンドポイントへの送信と、スパンの100%構造化ログ取り込みが可能になりました。
[^update-otlp-metrics]: アップデート: [Amazon CloudWatch now supports OpenTelemetry metrics in public preview（AWS What's New, 2026-04）](https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-cloudwatch-opentelemetry-metrics/) / 解説ブログ [Introducing OpenTelemetry and PromQL support in Amazon CloudWatch（AWS Cloud Operations Blog）](https://aws.amazon.com/blogs/mt/introducing-opentelemetry-promql-support-in-amazon-cloudwatch/)。メトリクスを OTLP で直接送り、PromQL で参照できるようになりました（プレビュー）。

つまり今は「ADOT 一択」ではなく、複数の入り口から選べる時代です。選択肢が増えたのは良いことですが、初めて触る人には「で、結局どれを使えばいいのか」が見えにくくなりました。この記事はそこを整理します。

## 1. 全体地図：構成は「Collector を挟むか」で3つに分かれる

AWS で OTel を導入する構成は、突き詰めると **「Collector を挟むか、挟むならどの Collector か」** という軸で3つに分かれます。

- **経路A：collector-less（ADOT SDK で直接送信）** — アプリの SDK が CloudWatch / X-Ray の OTLP エンドポイントへ直接送る。最小構成。
- **経路B：Collector 経由（CloudWatch Agent / ADOT Collector / 標準 Collector）** — アプリ → Collector → CloudWatch。集約・フィルタ・サンプリング・Prometheus 受信を担う。
- **経路C：カスタム Collector** — 標準に無いコンポーネントが要る、または非 AWS 環境から送るときに自前ビルドの Collector を使う。

一番大事な事実を先に押さえます。**この3経路は、最終的にどれも SigV4 認証で同じ CloudWatch OTLP エンドポイントにデータを届けます。計装コード自体は経路に依存しません。** だから「経路を間違えたら計装をやり直し」という心配は要りません。計装は先に進めてよく、収集・転送の部分だけを後から差し替えられます。これがこの記事全体を貫く安心材料です。

> 📌 **図1（意思決定の全体地図）**：3経路がそれぞれ SDK から出発し、A は直接、B/C は Collector を経由して、同じ3つの OTLP エンドポイント（xray / logs / monitoring）に SigV4 で収束する図。

### 構成ごとの機能差（公式比較表より）

| 機能 | 経路A（collector-less） | 経路B（Collector 経由） | 経路C（カスタム Collector） |
| --- | --- | --- | --- |
| Application Signals（APM・サービス検出・サービスマップ） | ○ | ○ | ○ |
| スパン／トレースサマリの検索・分析 | ○ | ○ | ○ |
| ログサマリの検索・分析 | ○ | ○ | ○ |
| AWS インフラ属性によるエンリッチメント | × | ○ | ○ |
| ランタイムメトリクス（JVM 等）とアプリの相関 | × | ○（標準 Collector） | × |
| 対応シグナル | メトリクス・トレース（ログは言語/SDK依存） | receiver/exporter 構成次第でログ・メトリクス・トレース | 同左 |

読み取れるのは、**「とりあえず Application Signals で APM を見る」だけなら全経路で可能**、ただし **ホスト先 AWS インフラの属性でエンリッチしたいなら Collector が要る** という線引きです。

## 2. 先に知るべき共通制約

経路を選ぶ前に、全経路に共通でかかる制約を押さえます。

### OTLP エンドポイント（シグナルごとに別ホスト）

CloudWatch の OTLP エンドポイントは **シグナルごとに別ホスト** です（`us-east-1` の例）：

- トレース：`https://xray.us-east-1.amazonaws.com/v1/traces`
- ログ：`https://logs.us-east-1.amazonaws.com/v1/logs`
- メトリクス：`https://monitoring.us-east-1.amazonaws.com/v1/metrics`（プレビュー[^update-otlp-metrics]）

プロトコルは **HTTP のみ（gRPC 非対応）**、OTLP 1.x、ペイロードは binary / json、圧縮は gzip か none。

### エンドポイントのサイズ制限（Collector を挟む理由にもなる）

- traces：1リクエスト最大 5MB / 10,000 spans
- metrics：1リクエスト最大 1MB / 1,000 datapoints
- logs：通常 1MB（リージョンによって Large Log Objects の扱いあり）

量が増えると、batch processor やサンプリングを挟む動機になります。これが経路B/Cの実利の一つです。

### 認証

- 原則 SigV4。Collector では `sigv4auth` extension が必須。
- bearer token 認証は **メトリクスとログのみ**（サービスごとに別 API キー）。**トレースは bearer token 非対応で SigV4 のみ**。
- bearer token は長期キーなので、Secrets Manager / Parameter Store / Kubernetes Secret から注入する。設定ファイルへの直書きは全経路で禁止。

### Transaction Search

**トレースを OTLP エンドポイントに送る前に Transaction Search を有効化** しておくこと。これが有効でないとスパンが X-Ray OTLP エンドポイントに届きません。

### サンプリングとコスト（最重要の落とし穴）

collector-less で traces を直接送る場合、SDK のデフォルトは **100% サンプリング** になり得ます。X-Ray の集中サンプリング（reservoir=1/s, rate=5%）は、明示的に `OTEL_TRACES_SAMPLER=xray` を設定しないと適用されません。Transaction Search で全量可視化したい場合はデフォルトのままでよいですが、**PoC 後はサンプリングを必ず見直してください**。取り込み量が想定の何倍にもなり、コストに直結します。

ローカルサンプリングで5%にする場合（公式の値）：

```bash
OTEL_TRACES_SAMPLER=parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG=0.05
```

X-Ray 集中サンプリングを使う場合：

```bash
OTEL_TRACES_SAMPLER=xray
OTEL_TRACES_SAMPLER_ARG=endpoint=http://cloudwatch-agent.amazon-cloudwatch:2000
```

## 3. 計装レイヤ：どの経路でも共通の出発点

経路をどれにするかと関係なく、まずアプリを計装します。OTel SDK を入れ、自動計装で HTTP・DB・各種クライアントのスパンを取れるようにするのが基本です。

### 言語別の自動計装の現況

- **Java / Node.js / Python / .NET** — エージェント型の自動計装が整っており、コードをほぼ変えずにスパンとメトリクスを取得できます。
- **Go** — Go は Java / Node.js / Python / .NET のような一般的な言語エージェント型 auto-instrumentation ではなく、eBPF ベースの zero-code instrumentation（OpenTelemetry Go Automatic Instrumentation / OBI）が進行中（work in progress）です。`net/http`・`database/sql`・gRPC など対応パッケージはコード変更なしで取れますが、対応範囲・制約を確認し、必要に応じて手動計装を併用するのが現実的です。本番では eBPF のオーバーヘッドやシンボル情報を残したビルドが要る点にも注意します。

### リソース属性が可視化の質を決める

計装時に設定する **リソース属性** が、後の可視化での見え方を大きく左右します。特に重要なのが次の3つです。

- `service.name` — Application Signals のダッシュボードでサービス名として表示。未設定だと `UnknownService`。
- `deployment.environment` — アプリが動く環境。Application Signals の「Hosted In」として表示。
- `aws.log.group.names` — メトリクス↔ログ相関を有効化（複数なら `&` 区切り）。

これらは ADOT SDK では `OTEL_RESOURCE_ATTRIBUTES` で渡します。X-Ray のトレースアノテーションや CloudWatch メトリクスのディメンションにも変換されるため、最初に丁寧に設計しておくと後の検索・フィルタが楽になります。

**コードサンプル①（最小計装・Java）**：ADOT Java エージェントを取得してアタッチする最小例。

```bash
curl -L -O https://github.com/aws-observability/aws-otel-java-instrumentation/releases/latest/download/aws-opentelemetry-agent.jar

JAVA_TOOL_OPTIONS="-javaagent:./aws-opentelemetry-agent.jar" \
OTEL_RESOURCE_ATTRIBUTES="service.name=my-java-svc" \
java -jar my-app.jar
```

## 4. 経路A：CloudWatch に直接送る（collector-less / ADOT SDK）

最速で始められる道です。Collector を運用しないぶん、構成要素はアプリと IAM だけ。AWS の公式手順では、この collector-less 構成でも **ADOT SDK** を使います（ピュアな upstream SDK ではなく）。SigV4 認証やエンドポイント向けの最適化が ADOT SDK 側に組み込まれているためです。

### 始める前の必須チェック

- **Transaction Search を有効化**（トレースを送るなら必須）。
- 重複コストを避けるため、ADOT SDK 側の Application Signals は無効（`OTEL_AWS_APPLICATION_SIGNALS_ENABLED=false`、デフォルト）のまま。
- **traces のサンプリングを確認**（デフォルト 100% の可能性。第2章参照）。
- ログ送信時は `x-aws-log-group` / `x-aws-log-stream` ヘッダで送信先を指定。**LogGroup / LogStream は事前作成が必要**。
- collector-less でもログ送信手順は用意されていますが、対応言語・バージョン・制約があるため、ログまで含める場合は利用言語ごとの ADOT SDK ドキュメントを確認してください。
- IAM は、トレースなら `AWSXrayWriteOnlyPolicy`、ログなら `logs:PutLogEvents` / `logs:DescribeLogGroups` / `logs:DescribeLogStreams`。認証情報は ADOT SDK が AWS SDK 経由で自動探索。
- 最低バージョン（Java）：ADOT Java エージェント 2.11.2 以降。

> 📌 **図2（経路Aの最小構成）**：アプリ（ADOT Java エージェント同梱）が、3本のエンドポイントへ直接 SigV4 で送る図。間に Collector は無い。

**コードサンプル②（経路A 環境変数フルセット・Java）**：トレース＋ログを us-east-1 へ直接送る起動例。

```bash
JAVA_TOOL_OPTIONS="-javaagent:./aws-opentelemetry-agent.jar" \
OTEL_METRICS_EXPORTER=none \
OTEL_TRACES_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://xray.us-east-1.amazonaws.com/v1/traces \
OTEL_LOGS_EXPORTER=otlp \
OTEL_EXPORTER_OTLP_LOGS_PROTOCOL=http/protobuf \
OTEL_EXPORTER_OTLP_LOGS_ENDPOINT=https://logs.us-east-1.amazonaws.com/v1/logs \
OTEL_EXPORTER_OTLP_LOGS_HEADERS=x-aws-log-group=MyLogGroup,x-aws-log-stream=default \
OTEL_TRACES_SAMPLER=parentbased_traceidratio \
OTEL_TRACES_SAMPLER_ARG=0.05 \
OTEL_RESOURCE_ATTRIBUTES="service.name=my-java-svc" \
java -jar my-app.jar
```

> ※スパンは `aws/spans` ロググループに、ログは指定した LogGroup に入ります。

**経路Aが向くケース**：PoC、小〜中規模、AWS に閉じてよい構成、Collector の運用人員を割きたくないチーム。ECS / EC2 の小規模アプリは経路Aから始めやすいです。

## 5. 経路B：Collector を挟む（CloudWatch Agent / ADOT / 標準 Collector）

経路A に Collector を1段足すと、何が解けるのか。

- **複数アプリ・ホストの集約** — CloudWatch への接続数を1本にまとめる。
- **送信前の加工** — 属性の付け外し、バッチ化、サンプリングを Collector 側で。アプリを再デプロイせずに量・中身を制御。
- **Prometheus 受信** — Prometheus receiver などで取り込んだメトリクスを、CloudWatch 側の対応機能で PromQL ライクに扱える構成を取りやすい（CloudWatch の OpenTelemetry メトリクス／PromQL 対応はプレビュー[^update-otlp-metrics]）。

なお、AWS で最も無難に始める Collector 経由の構成は、CloudWatch Agent に含まれる pre-packaged OpenTelemetry setup を使う方法です。この記事では理解しやすさのため「Collector」と表現しますが、実装時は CloudWatch Agent / ADOT Collector / upstream Collector のどれを使うかを明示して選んでください。

### 設定の肝：otlphttp exporter + sigv4auth extension

送り先は経路A と同じ OTLP エンドポイントです。`otlphttp` exporter に `sigv4auth` extension を組み合わせ、シグナルごとに `service` を変えて認証します（ログ→`logs`、トレース→`xray`、メトリクス→`monitoring`）。IAM は EC2 / EKS いずれも `CloudWatchAgentServerPolicy`。EKS なら IRSA でロールをサービスアカウントに紐づけます。

> 📌 **図3（経路Bの集約・加工構成）**：複数のアプリ → 1つの Collector → 3エンドポイントへ。Collector 内に sigv4auth とパイプラインがある図。

**コードサンプル③（Collector YAML、logs + traces を us-east-1 へ）**：

```yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318
exporters:
  otlphttp/logs:
    compression: gzip
    logs_endpoint: https://logs.us-east-1.amazonaws.com/v1/logs
    headers:
      x-aws-log-group: MyApplicationLogs
      x-aws-log-stream: default
    auth:
      authenticator: sigv4auth/logs
  otlphttp/traces:
    compression: gzip
    traces_endpoint: https://xray.us-east-1.amazonaws.com/v1/traces
    auth:
      authenticator: sigv4auth/traces
extensions:
  sigv4auth/logs:
    region: "us-east-1"
    service: "logs"
  sigv4auth/traces:
    region: "us-east-1"
    service: "xray"
service:
  extensions: [sigv4auth/logs, sigv4auth/traces]
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [otlphttp/logs]
    traces:
      receivers: [otlp]
      exporters: [otlphttp/traces]
```

> メトリクス用は exporter の endpoint を `https://monitoring.us-east-1.amazonaws.com/v1/metrics`、`sigv4auth` の `service` を `monitoring` にし、`batch` プロセッサ（例：`send_batch_size: 200`, `timeout: 10s`）を挟みます。

補足：Application Signals で確実に100%のスパンを記録したい重要アプリでは、SDK 側のサンプラーを `always_on` にしておくことが公式に推奨されています（コストとのトレードオフに注意）。

**経路Bが向くケース**：複数サービスを集約したい、本番でコスト・ノイズを制御したい、Prometheus 資産を活かしたい、AWS サポート付きにしたいチーム。EKS / 複数サービスなら経路Bが自然です。

## 6. 経路C：カスタム Collector とマルチクラウド

標準ディストリビューションに無いレシーバ／プロセッサ／エクスポータが要る、または **AWS の外（他クラウド、オンプレ、CI/CD）からも送りたい** ときは、カスタム Collector を使います。

### bearer token 認証という逃げ道

AWS 認証情報を持たせられない環境では bearer token（API キー）認証が使えます。ただし制約があります。

- bearer token が使えるのは **メトリクスとログのエンドポイントのみ**（サービスごとに別 API キー）。
- **トレースは bearer token 非対応で SigV4 のみ**。

bearer token なら AWS SDK 依存も認証情報ファイルも要らないので、非 AWS プラットフォームでも Collector を動かせます。

**コードサンプル④（bearer token で metrics を送る、抜粋）**：

```yaml
extensions:
  bearertokenauth:
    filename: "/etc/otel/cw-api-key"
exporters:
  otlphttp:
    endpoint: "https://monitoring.us-east-1.amazonaws.com/v1/metrics"
    auth:
      authenticator: bearertokenauth
service:
  extensions: [bearertokenauth]
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [otlphttp]
```

> ⚠️ API キーを設定ファイルに直書きしない。`filename` でマウントしたシークレットを読むか、`${env:VAR}` でシークレットマネージャから注入します。

**経路Cが向くケース**：マルチクラウド／ハイブリッド前提、将来 Grafana など AWS 外のバックエンドにも分岐させたい、標準に無いコンポーネントが要るチーム。オンプレ / 他クラウド / CI から送る場合も経路C（ただし traces は SigV4 が必要）。

## 7. 可視化レイヤ：どの経路でも CloudWatch でどう見えるか

経路A〜Cのどれを選んでも、可視化の入り口は基本的に共通です。

### Application Signals（APM の中心）

OTLP でトレースを送り、Transaction Search や必要なリソース属性が整っていれば、CloudWatch Application Signals の APM 体験につながります。Application Signals は計装済みアプリから自動的にサービスを検出し、レイテンシ・可用性・エラー率・リクエスト数を収集します。

- **サービスマップ** — 検出したサービスと依存関係を自動マッピング。依存先のヘルスやデプロイ時刻も見える。
- **SLO / SLI** — 自動収集される Latency と Availability を SLI として、宣言的に SLO を定義できる。Availability は `(1 - Fault Rate) × 100`（Fault は 5xx）。エラーバジェットの消費が速いとアラートが上がる。
- **トラブルシューティングドロワー** — エラー率が高いサービスノードをクリックすると、指標・直近のデプロイ・依存先のヘルスが1か所に出る。

### トレース ↔ ログ の相関

Application Signals の trace to log correlation を有効にすると、トレース ID とスパン ID がアプリログに自動注入され、トレース詳細画面の下部に対応するログが出ます。

有効化はロギング設定側で行います。Java（Logback）なら encoder の pattern に次を挿入します：

```text
trace_id=%mdc{trace_id} span_id=%mdc{span_id} trace_flags=%mdc{trace_flags} %5p
```

EKS・ECS では追加手順は不要、EC2 では環境変数の追加設定が要ります。メトリクス↔ログの相関は、計装時に `aws.log.group.names` を `OTEL_RESOURCE_ATTRIBUTES` に足すだけで有効になります。

> 📌 **図4（計装した値が CloudWatch 上でどう見えるか）**：サービスマップ＋レイテンシ/エラー率のグラフ＋トレース詳細下部に相関ログが並ぶ画面。第3章で設定した `service.name` がサービス名として、`deployment.environment` が「Hosted In」として表示される点を矢印で示し、計装→可視化の伏線を回収する。

## 8. 結論：状況別の早見表

| 軸 | 経路A（直接） | 経路B（Collector 経由） | 経路C（カスタム Collector） |
| --- | --- | --- | --- |
| 導入の速さ | ◎ 最速 | ○ | △ |
| 運用負荷 | ◎ 低い（Collector なし） | △ Collector 運用が要る | △ 自前ビルド＋運用 |
| インフラ属性エンリッチメント | × | ○ | ○ |
| サンプリング／フィルタ制御 | △ アプリ側のみ | ◎ Collector 側で柔軟 | ◎ |
| 認証の柔軟性 | SigV4 | SigV4 | SigV4 ＋ bearer token（非AWS可） |
| 移植性／マルチクラウド | △ AWS 寄り | ○ | ◎ |
| 想定環境 | ECS / EC2 の小規模 | EKS / 複数サービス | オンプレ / 他クラウド / CI |

指針はシンプルです。

- **とにかく速く試したい / AWS に閉じてよい** → 経路A。
- **複数サービスを集約したい / 本番でコスト・ノイズを制御したい** → 経路B。
- **非 AWS 環境からも送る / 将来 AWS 外のバックエンドへ逃がしたい / 標準に無い部品が要る** → 経路C。

そして現実的なおすすめは、**経路A で始めて、必要になったら B / C に育てる** こと。計装コードは経路に依存しないので、収集・転送レイヤだけを後から差し替えれば移行できます。

## 公開前チェックリスト

- [ ] Transaction Search を有効化したか
- [ ] `service.name` を設定したか
- [ ] `deployment.environment` を設定したか
- [ ] ログ送信先の LogGroup / LogStream を事前作成したか
- [ ] collector-less の traces サンプリング率を確認したか
- [ ] Collector 経由の場合、`sigv4auth` の `service` をシグナルごとに変えたか
- [ ] bearer token を使う場合、対象が logs / metrics のみであることを確認したか
- [ ] メトリクス直接取り込みのプレビュー/提供状況を最新ドキュメントで確認したか

## 参照した公式ドキュメント

- [OTLP Endpoints](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPEndpoint.html)
- [Getting started（経路比較表）](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPGettingStarted.html)
- [collector-less / ADOT SDK](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLP-UsingADOT.html)
- [OpenTelemetry Collector 設定例](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch-OTLPSimplesetup.html)
- [OpenTelemetry Go zero-code instrumentation](https://opentelemetry.io/docs/zero-code/go/)

### 関連アップデート記事

- [Amazon CloudWatch launches full visibility into application transactions（AWS What's New, 2024-11）](https://aws.amazon.com/about-aws/whats-new/2024/11/amazon-cloudwatch-visibility-application-transactions/)
- [Amazon CloudWatch now supports OpenTelemetry metrics in public preview（AWS What's New, 2026-04）](https://aws.amazon.com/about-aws/whats-new/2026/04/amazon-cloudwatch-opentelemetry-metrics/)
- [Introducing OpenTelemetry and PromQL support in Amazon CloudWatch（AWS Cloud Operations Blog）](https://aws.amazon.com/blogs/mt/introducing-opentelemetry-promql-support-in-amazon-cloudwatch/)
- [AWS Observability ICYMI: Jan-May 2026（AWS Cloud Operations Blog）](https://aws.amazon.com/blogs/mt/aws-observability-icymi-jan-may-2026/)

---

*本記事の技術的記述は、CloudWatch OTLP エンドポイント仕様、collector-less / ADOT SDK 手順、OpenTelemetry Collector 設定例、Application Signals のトレース↔ログ相関・サンプリング、OpenTelemetry Go 計装の各公式ドキュメント（2026年6月時点）を参照して裏取りしています。メトリクスの OTLP 直接取り込みおよび Go の zero-code 計装はいずれも進行中／プレビューのため、本番採用前に最新の提供状況を確認してください。*
