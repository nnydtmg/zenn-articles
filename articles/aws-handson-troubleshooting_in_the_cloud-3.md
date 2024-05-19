---
title: "AWS Support - Troubleshooting in the cloud Workshopをやってみた③"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","cloudwatch","devops","operation"]
published: true
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
コストとして$2/h程度かかるので気になる方は環境削除を忘れずに。
なお、スタックごと削除しようとした際にエラーになる場合は、エンドポイントの状態をご確認ください。必要に応じて手動で削除して再度スタック削除すれば削除できると思います。
:::

![](https://storage.googleapis.com/zenn-user-upload/1c50827d03cd-20240509.png)
*workshop studioから引用*

# Issue1
最初のタスクはALBのタイムアウトへの対応です。普段からよく遭遇するトラブルの一つではないでしょうか。

まずはCURLコマンドを利用して接続確認を行います。今回はCloudShellから行っていきます。

:::details 失敗例
```bash
[cloudshell-user@ip-10-130-84-152 ~]$ curl -v --max-time 15 http://WebApp-ALB-625179684.us-east-1.elb.amazonaws.com/
* Host WebApp-ALB-625179684.us-east-1.elb.amazonaws.com:80 was resolved.
* IPv6: (none)
* IPv4: 3.219.207.227
*   Trying 3.219.207.227:80...
* Connection timed out after 15002 milliseconds
* Closing connection
curl: (28) Connection timed out after 15002 milliseconds
[cloudshell-user@ip-10-130-84-152 ~]$ 
```
:::

:::details 成功例
```bash
[cloudshell-user@ip-10-130-84-152 ~]$ curl -v --max-time 15 http://WebApp-ALB-625179684.us-east-1.elb.amazonaws.com/
* Host WebApp-ALB-625179684.us-east-1.elb.amazonaws.com:80 was resolved.
* IPv6: (none)
* IPv4: 52.205.48.32, 3.219.207.227, 54.227.213.207
*   Trying 52.205.48.32:80...
* Connected to WebApp-ALB-625179684.us-east-1.elb.amazonaws.com (52.205.48.32) port 80
> GET / HTTP/1.1
> Host: WebApp-ALB-625179684.us-east-1.elb.amazonaws.com
> User-Agent: curl/8.5.0
> Accept: */*
> 
< HTTP/1.1 200 OK
< Date: Thu, 09 May 2024 13:56:21 GMT
< Content-Type: text/html
< Transfer-Encoding: chunked
< Connection: keep-alive
< Server: BaseHTTP/0.6 Python/3.7.16
< 
<!DOCTYPE html>
<html lang="en">
<head>
<title>AWS Support Troubleshooting Workshop</title>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://www.w3schools.com/w3css/4/w3.css">
<link rel="stylesheet" href="https://www.w3schools.com/lib/w3-theme-teal.css">
<link rel="icon" type="image/ico" href="https://a0.awsstatic.com/main/images/site/fav/favicon.ico">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.3.0/css/font-awesome.min.css">
</head>
<body>
<!-- This is a modified version of W3 School's Kitchensink template: https://www.w3schools.com/w3css/tryw3css_templates_black.htm -->

<!-- Header -->
<header class="w3-container w3-theme w3-padding" id="myHeader">
  <div class="w3-center">
  <h4>AWS Support Troubleshooting Workshop</h4>
  <h1 class="w3-xxxlarge w3-animate-bottom">Web Server Diagnostics</h1>
    <div class="w3-padding-32">
      <button class="w3-btn w3-xlarge w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('id01').style.display='block'" style="font-weight:900;">HELP</button>
    </div>
  </div>
</header>

<!-- Modal -->
<div id="id01" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('id01').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>Please follow the Workshop Page for step-by-step guidance, hints and tips.</h4>
        <h5>Diagnostic information:</h5>
      </header>
      <div class="w3-padding">
        <p>The tests on this webpage indicate which dependencies are functioning correctly within the webserver code.</p>
        <p>Your task is to find out why some are failing and to fix them, without changing code on the webserver.</p>
      </div>
      <footer class="w3-container w3-theme-l1">
        <p>Good Luck!</p>
      </footer>
    </div>
</div>

<div id="extTest" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('extTest').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>External Dependency Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test performs an HTTP (port 80) GET request to 1.1.1.1.</p>
      </div>
    </div>
</div>

<div id="ssmTest" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('ssmTest').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>AWS Systems Manager (SSM) Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test calls SSM with the API call GetParameter to obtain configuration. It requires the appropriate network routing and IAM permissions.</p>
      </div>
    </div>
</div>

<div id="ddbTest" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('ddbTest').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>Amazon DynamoDB Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test calls DynamoDB using the GetItem API to retrieve data from a table. It requires the appropriate network routing and IAM permissions for the table, the VPC Endpoint and the Instance role.</p>
      </div>
    </div>
</div>


<div id="s3Test" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('s3Test').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>Amazon Simple Storage Service (S3) Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test attempts to retrieve an object from S3: s3://networking-base-vpc-infrastr-networkingassetbucket-di7ea9rd8dbz/artifacts/three-tier-webstack/s3_get_green_checkmark.png. This test requires the appropriate network configuration (security group rules, network ACLs, routing) as well as the correct IAM permissions for the bucket, the VPC Endpoint and the instance role.</p>
      </div>
    </div>
</div>


<div id="ec2mdTest" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('ec2mdTest').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>EC2 Instance Metadata Service Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test calls the EC2 Instance Metadata service to obtain a number of details: availability zone, instance ID, instance type, private hostname and private IP address. See the <a href="https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-metadata.html">documentation page</a> for more details.</p>
      </div>
    </div>
</div>

<div id="dnsTest" class="w3-modal">
    <div class="w3-modal-content w3-card-4 w3-animate-top">
      <header class="w3-container w3-theme-l1">
        <span onclick="document.getElementById('dnsTest').style.display='none'"
        class="w3-button w3-display-topright">×</span>
        <h4>Amazon Route53 VPC DNS Test</h4>
      </header>
      <div class="w3-padding">
        <p>This test attempts to use the within-VPC Amazon Route 53 Resolver server to resolve the DNS record "aws.amazon.com". This test requires no connectivity outside of the VPC. See the <a href="https://docs.aws.amazon.com/vpc/latest/userguide/vpc-dns.html#AmazonDNS">documentation page</a> for more details.</p>
      </div>
    </div>
</div>

<div class="w3-row-padding w3-center w3-margin-top">
<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">
  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/dynamodb_logo.png" alt="Amazon Dynamo DB Logo" style="width:20%"></h3><br>
  <h3>Amazon Dynamo DB Test</h3>
  <p><span class="w3-text-red">FAILED</span></p>
  <p>Time to run test: 144.4 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('ddbTest').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>

<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">
  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/s3_logo.png" alt="Amazon Simple Storage Service (S3) Logo" style="width:20%"></h3><br>
  <h3>Amazon Simple Storage Service (S3) Test</h3>
  <p><span class="w3-text-red">FAILED</span></p>
  <p>Time to run test: 305.72 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('s3Test').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>


<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">
  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/external_dependency_logo.png" alt="External Dependency Test Logo" style="width:20%"></h3><br>
  <h3>External Dependency (1.1.1.1) Test</h3>
  <p><span class="w3-text-red">FAILED</span></p>
  <p>Time to run test: 5009.35 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('extTest').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>
</div>

<div class="w3-row-padding w3-center w3-margin-top">
<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">
  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/metadata_logo.png" alt="Amazon Elastic Compute Cloud Logo" style="width:20%"></h3><br>
  <h3>Amazon EC2 Instance Meta-data Test</h3>
  <p><span class="w3-text-green">SUCCESS</span></p>
  <p>Time to run test: 0.01 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('ec2mdTest').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>

<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">
  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/route53_logo.png" alt="Amazon Route 53 Logo" style="width:20%"></h3><br>
  <h3>Amazon Route53 VPC DNS Test</h3>
  <p><span class="w3-text-green">SUCCESS</span></p>
  <p>Time to run test: 4.13 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('dnsTest').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>

<div class="w3-third">
  <div class="w3-card w3-container" style="min-height:460px">  <h3><img src="https://github.com/davidsataws/troubleshooting-workshop/raw/main/static/networking/self-paced/assets/three-tier-webstack/systems_manager_logo.png" alt="AWS Systems Manager Logo" style="width:20%"></h3><br>
  <h3>AWS Systems Manager (SSM) Test</h3>
  <p><span class="w3-text-green">SUCCESS</span></p>
  <p>Time to run test: 165.75 ms</p>
  <p><br></p>
  <p><button class="w3-btn w3-large w3-dark-grey w3-hover-light-grey" onclick="document.getElementById('ssmTest').style.display='block'" style="font-weight:900;">DETAILS</button></p>
  <p></p>
  </div>
</div>
</div>

</body>
</html>
* Connection #0 to host WebApp-ALB-625179684.us-east-1.elb.amazonaws.com left intact
[cloudshell-user@ip-10-130-84-152 ~]$ 
```
:::

コマンド結果のIPが異なると接続の成否が変わります。
ALBがマルチAZで構成されていて、特定のIPに振り分けられた場合のみ接続がタイムアウトになるようです。ここから分かることは、
* ALBへの接続は成功している
* ALBからの戻り通信に問題がありそう
* 一部のIPへの通信だけエラーになっている

の3点です。では、戻り通信に問題があるというのはどういうことかというと、バックエンド(EC2)の状態に異常がない場合はNWの設定が間違えている可能性が高いです。
要素としては、
1. ルートテーブル
2. セキュリティグループ(SG)
3. ネットワークACL(NACL)
があります。横並びで順に確認すると、ルートテーブルのみ差分があることが分かります。

![](https://storage.googleapis.com/zenn-user-upload/a1ea87ee2493-20240509.png)

VPCのコンソールからWebApp-VPCを選択し、リソースマップを確認すると、**WebApp-ALB1-b**のルートテーブルだけ他のALBサブネットと比べると**App-RTB**に紐づいていることが分かります。
この**App-RTB**を選択すると、デフォルトルートがNATGWに向いているため、非対称通信となりタイムアウトが発生していそうです。

:::message
なお、一部のバックエンドへの通信がエラーになっている場合は、このように横並びで設定を確認するのが、最も早い解決策になるかと思います。特にIaC化されていない環境や今回のようにCloudFormationのような非関数的な定義をするものを利用した場合に、設定に差異が発生することが多いです。
:::

サブネットを選択し、「ルートテーブルの関連付けを編集」から**WebApp-Public-RTB**を選択して保存します。
再度CURLコマンドを複数回実行して、3つのIPアドレスに対して接続確認ができればこの章は完了です。


# Issue２
次のシナリオは、Cloudwatchアラームを確認します。ELBのunhealthyHostCountAlarmがアラーム状態になっているので、これを解決していきます。
ALBのターゲットを確認すると3つのインスタンス全てがUnhealthyになっていることが分かります。

![](https://storage.googleapis.com/zenn-user-upload/00f68c6a7768-20240509.png)

ヘルスチェックに失敗しているが、CURLコマンドが成功しているということは、インスタンスとしては正常に起動していると想像できます。そこで、ターゲットの**ヘルスステータスの詳細**を確認すると、ステータスコードが**299**になっていることが分かります。
ALBはデフォルトで**HTTP 200 OK**を正常とみなします。
今回はアプリケーションが**299**を正常なコードとして定義しているので、**HTTP 299**を意図的に正常なコードとして追加します。

![](https://storage.googleapis.com/zenn-user-upload/49a171630a62-20240509.png)

しばらくすると、ステータスが正常に変化するので、再度Cloudwatchアラームを確認して、数分後にアラームがOKに移行していることを確認します。

![](https://storage.googleapis.com/zenn-user-upload/745b34a8247e-20240509.png)

![](https://storage.googleapis.com/zenn-user-upload/913ce7830590-20240509.png)

これによって問題が解消しました。

# Issue3
次のシナリオでは**HTTP 504**エラーへの対応です。
CloudWatchメトリクスのELBアクセスログを確認すると、	**HTTPCode_Target_5XX_Count**が複数回カウントされているかと思います。これを解消していきます。

![](https://storage.googleapis.com/zenn-user-upload/b949046c7527-20240518.png)

まず、504エラーが起きる原因としては、タイムアウトによって正常にリクエストが返ってきていない状態ですので、
1. サーバーが機能していない(処理が滞っている)
2. NW上のどこかでタイムアウトしている

などが考えられます。
1.に対しては、サーバーのCPUやメモリなどのリソース状況を確認してアプリケーションが正しく動作しているかを確認します。今回は特に問題がなさそうなので、他を確認してみます。

全てのリクエストで同様の事象が起きるのであれば、通信のエンドポイント(今回ではALB)が被疑箇所になりえますが、この環境では一部のリクエストに限り、504となってしまうようです。(CloudWatchのカウントが実際に疎通確認した回数よりも少ないため。)
しかし、1章の通りCURL実行時の成功したIPは異なるため、今回は横並びでの差異はなさそうです。共通の設定がどこか不備があるのではないかと想像できます。

NW的な問題が疑われるので、VPC周りの設定を確認してみます。

ルートテーブルは先ほどの章で確認したので、割愛します。SGについても特段問題のある箇所はなさそうです。
NACLを確認すると一部設定が足りていないことが分かります。
NACLは**ステートレス**のため戻りの通信も正しく許可してあげる必要があります。ここは一般的なNWの知識になりますが、TCPやUDPは事前に予約された**0-1023のwell-knownポート**と動的に利用される**1024-65535のエフェメラルポート**[^1]が存在します。例えば、HTTPは80番ポートを使用して通信を受けますが、戻りの通信はエフェメラルポートの空いたポートから通信されます。

[^1]:OSやバージョンによっても範囲は変わりますが、現在は基本的に1024-65535がエフェメラルポートとして[RFC6056](https://www.rfc-editor.org/rfc/rfc6056.txt)で定義されています。

![](https://storage.googleapis.com/zenn-user-upload/004729ebe3aa-20240518.png)

これらからNACLのWEB-APPサブネットからエフェメラルポートを使用した通信を許可してあげる必要があることが分かりました。
ちなみに、NACLのルールはルール番号が小さい順に優先されるので注意が必要です。許可設定を入れてもそれより小さいルールでブロックしていると通信ができなくなります。

なお、今回の環境ではAWS Configが有効になっており、コンプライアンスルールに違反していることも確認できます。もしConfigルールからアラートを設定している場合は、こちらでも問題に気づくことができるかもしれません。

![](https://storage.googleapis.com/zenn-user-upload/a03181330d5b-20240518.png)

これによってこの章の課題はクリアしました。

# Issue4
ブラウザでALBにアクセスするとWEBページが表示されます。WEBページを確認すると、各種APIテストの結果がFAILEDになっています。この原因を確認していきましょう。

![](https://storage.googleapis.com/zenn-user-upload/1d8cf5d1b57c-20240518.png)

まずは、Dynamo DBです。今回の環境はX-Rayが導入されているため、CloudWatchのコンソールからX-Rayのトレースを追いかけても良いですが、より基本的にみていこうかと思います。

まず、AWSのサービスにアクセスするためには、NW的に疎通できることと、適切なIAM権限が必要です。

Dynamo DBテーブルのデータを取得するためには、アクセス元が対象テーブルに対して**GetItem API**を実行する権限が必要です。このハンズオンでは、EC2上のアプリケーションがDynamo DBへアクセスするので、EC2に対してIAM権限が付与されているかを確認します。

![](https://storage.googleapis.com/zenn-user-upload/affa15834f71-20240518.png)

EC2コンソールからインスタンスを選択してIAMロールを確認していくと、権限はありますが**Condition要素**が設定されています。このCondition要素とは[アクセス元の制限などをするため](https://docs.aws.amazon.com/ja_jp/vpc/latest/privatelink/vpc-endpoints-ddb.html#associate-route-tables-ddb)のもので、**VPCエンドポイントを経由すること**という記載があります。

AWSのサービスにアクセスするためには、インターネットを介したパブリックアクセス[^2]とAWSの内部NWを通るプライベートアクセスがあります。プライベートアクセスするためには、VPCエンドポイントの設定が必要です。

そこで、VPCエンドポイントを確認すると、存在はしますがアクセスできていないことが分かります。リソースとしては充足しているがアクセスできないのでNW経路に問題がありそう。ということで、Dynamo DBのエンドポイントからルートテーブルを確認します。ルートテーブルのコンソールからではなく、エンドポイントからルートテーブルを関連付けると、一度に複数のルートテーブルを指定できるので便利です。

![](https://storage.googleapis.com/zenn-user-upload/2ed2500cefe1-20240518.png)
*事前*

![](https://storage.googleapis.com/zenn-user-upload/99a35286c478-20240518.png)
*変更*

Webページを確認しSUCCESSになっていればこの章は完了です。

![](https://storage.googleapis.com/zenn-user-upload/0cad1a582dc7-20240518.png)

[^2]:厳密にはAWSサービスへの通信はAWS内部通信と明記されているのですが、各セキュリティ基準などでは許容されないので確実にプライベートアクセスできるようにしましょう。


# Issue5
残り2つの障害を確認していきましょう。まずはS3です。

この環境でS3へのアクセスが発生しているのは、アプリケーションの起動時にコードを取得するタイミングとAPI実行時にオブジェクトを取得するタイミングがあります。前者のタイミングはサーバーが正常に起動しているので問題なく取得できていそうです。(もちろんコードを取得してなくても正常に起動できているとみなすものもありますが、ALBの章でアプリケーションの起動に問題がないと判断しているので、ここはスルーします。)

では、後者の問題を解決する方向に考えましょう。
先ほどの章でAWSサービスへの通信はNWとIAMが適切に設定されていることが必要と書きました。しかし、エンドポイントにも**エンドポイントポリシー**というポリシーがあり、IAM同様非常に重要な要素かつ見落としがちな点かと思います。

アクセス成否がバケット/オブジェクトで異なるということは、どこかでフィルターされている可能性が高いです。ルーティングについては、基本的にどのバケットに対しても同じエンドポイントを経由するので、問題はなさそうです。
IAMポリシーもS3については特にバケット単位での設定はされていなさそうです。
エンドポイントポリシーを確認すると、S3の**ARN**が記載されている箇所があるかと思います。ここの各行に合致しないと許可されないというバケットポリシーが設定されているのですが、エラーになっているAPIが取得する画像ファイルのARNが存在しないことが分かりました。

![](https://storage.googleapis.com/zenn-user-upload/ee6d0a72c911-20240518.png)
*事前*

取得すべき画像ファイルをS3から探し、ARNをコピーして追記しましょう。その際、カンマ(,)が抜けることが多いので注意しましょう。

![](https://storage.googleapis.com/zenn-user-upload/7769547b9268-20240518.png)
*事後*

これによってS3の項目もSUCCESSになったかと思います。

![](https://storage.googleapis.com/zenn-user-upload/d8da07b49763-20240518.png)

# Issue6
最後に外部アクセスのエラーを解消していきましょう。

外部環境へのアクセスのためには、VPCからインターネットへ疎通できる必要があります。(もちろんオンプレ環境などと内部通信で外部環境にアクセスする場合もあります。)
今回は**1.1.1.1**へのアクセスが失敗しているようです。アクセス先のIPが明確なので、ここにきて王道のVPCフローログを確認したいと思います。

VPCフローログとは、VPC内の通信をすべてキャプチャしアクセス状態を記録する機能です。(確実に有効にしておきましょう。)ただし、IPアドレスレベルでの記録になるので、宛先IPが分かる場合のトラブルシューティングに向いているかと思います。

VPCのコンソールからVPCフローログを確認し、上記のアドレスでフィルタリングしてみましょう。

![](https://storage.googleapis.com/zenn-user-upload/3cbe95ef40e5-20240518.png)

すると、**REJECT**となっているログが存在するかと思います。これはトラフィックが**拒否された**という証拠で、その原因となるのはセキュリティグループかネットワークACLになります。

先ほどの章と同様にAppサブネットにアタッチされているNACLを確認し、アウトバウンドルールの該当するルールを探します。1.1.1.1に対して**DENY**のルールが設定されているかと思うので、そのルールを削除してみましょう。

![](https://storage.googleapis.com/zenn-user-upload/466ee6a6674f-20240518.png)

すると、外部通信に関してもSUCCESSとなったことが確認でき、これによって全ての課題がクリアになりました！

![](https://storage.googleapis.com/zenn-user-upload/e83ccf0582a0-20240518.png)

# Issue7
ボーナス課題として2つ設定されていますので、お時間のある方は見てください。
ボーナス1つ目はAPIをWell-Architected Frameworkに沿って別VPCに移行したことにより、接続ができなくなるというものです。

先ほどのALBのURLの末尾に`/bonus`を追加するとボーナス用のサイトが表示されます。

![](https://storage.googleapis.com/zenn-user-upload/6deee1612e66-20240519.png)

どちらのコネクションもFAILEDで5秒程でタイムアウトしていることが分かります。サーバーへの接続が失敗している原因の要素として考えられるのは、NWレベルの疎通ができていないことが多いですが、AWS等クラウドプロバイダーを利用すると、その間にあるコンポーネントが多いので対象がいくつか考えられるかと思います。
単純にルーティングの問題、セキュリティグループの問題、NACLの問題などが大きく関係しうるかと想像できるのでその辺りを見ていきます。

まずはこの通信が、どこからどこへ接続しているかを確認しましょう。サイトからDETAILSをクリックすると、このように表示されます。
> This test calls the API server (rsapi.supportworkshopapi.com) in the TGW-peered VPC. It requires the appropriate network routing for traffic from the webapp VPC to the API VPC.

つまり、WebApp VPCからTGW-peered VPC内のAPIサーバーにAPIコールを行っているということです。ただし、今回はTCPレベルの疎通確認となっているので注意してください。
この宛先となる`rsapi.supportworkshopapi.com`が何を指しているかは、Route53のレコードを確認してみましょう。

![](https://storage.googleapis.com/zenn-user-upload/02c33d597226-20240519.png)

`10.2.4.168`というアドレスへのAレコードが確認できたので、フローログを確認するとACCEPTされています。つまりフィルターによって拒否されているということではなさそうです。

![](https://storage.googleapis.com/zenn-user-upload/b3e4a472200d-20240519.png)

なので、他の可能性としてはルーティングのエラーです。
現在WebApp-AppのルートテーブルにはTGWへのルートが存在しないことが分かります。なので、`10.2.4.0/24`のCIDRへのアクセスはTGWを経由して通信できるように設定を追加してあげましょう。

![](https://storage.googleapis.com/zenn-user-upload/58862b380799-20240519.png)

するとWEBサイト上でSUCCESSになることが確認できます。これによりこの章は完了です。

ちなみに、TGWは複数VPCを接続するようなシステムを開発する際は、ほぼ必須で必要になるので、実際にTGWを設定してみるのもオススメします。


# Issue8
最後の課題です。TCPレベルの疎通はできているがHTTPレベルのテストが失敗しているということは、HTTPの通信をフィルタする機能がどこかにありそうだと考えられます。
こちらもWEBサイトから詳細を確認してみましょう。

> This test calls the API server (rsapi.supportworkshopapi.com) in the TGW-peered VPC. It requires the appropriate network routing for traffic from the webapp VPC to the API VPC. It also requires the API server to be running and for the request to successfully pass through the firewall.

同じリクエストをしていそうですが、firewallを正常に通過しているかどうかが関係してきそうです。
ではfirewall機能がどこにあるかというと、API VPCの中にfirewallサブネットがあり、さらにGatewayエンドポイントがあるのでNetwork Firewallが存在していそうです。VPCコンソールからNetwork Firewallを確認するとルールが設定されているのが確認できます。

関連付けられているポリシーを確認すると、ルールグループが指定され、その中に`drop http any any -> any any (flow:to_server; http.host; content:"rsapi.supportworkshopapi.com"; sid:1;)`というルールが設定されています。
これは`rsapi.supportworkshopapi.com`への通信をDROPするので、ここが原因でアクセスが失敗していると分かりました。

このルールを削除して保存するとWEBサイトからSUCCESSになっていることが確認できるかと思います。

![](https://storage.googleapis.com/zenn-user-upload/1bebe405ddcb-20240519.png)

以上ですべての課題クリアです！

最終的な構成図はこのようになっています。

![](/images/aws-handson-troubleshooting-3/architecture.png)



# 最後に
かなり長くなってしまいました。
この記事の中ではあまりX-Rayを多用しませんでした。基本的なトラブルシューティング方法としての観点などを記載してきたつもりですが、X-Rayを利用すればより短縮してトラブルシューティングに取り組むことが可能になるかもしれません。
このように、属人化しがちなトラブルシューティングの勘所のようなものをツールを用いて、より簡単に同じレベルで見ていけるのがオブザーバビリティの利点です。

この記事を読みながらワークショップを進めていただいた方は、ぜひX-Rayを使ったトラブルシューティングも体験してみてください。
アプリケーションの遅延などがリソースマップになって可視化され、ドリルダウンによってログの確認まで進むことができるので、見るべき箇所が明確でよりスピーディに問題解決に向かえるかと思います。(こんなに長い記事にならなかったかも。。。)

![](https://storage.googleapis.com/zenn-user-upload/20da6ad9d92e-20240518.png)
*リソースマップの例*

最後まで読んでいただきありがとうございました。
ぜひ他の章もチャレンジしてみてください！


# リンク

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-1

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-2-1


# 参考
## Issue1
https://repost.aws/ja/knowledge-center/elb-troubleshoot-connection-errors

## Issue2
https://repost.aws/ja/knowledge-center/elb-fix-failing-health-checks-alb

## Issue4
https://repost.aws/ja/knowledge-center/dynamodb-access-denied-exception

## Issue5
https://repost.aws/ja/knowledge-center/connect-s3-vpc-endpoint

## Issue6

