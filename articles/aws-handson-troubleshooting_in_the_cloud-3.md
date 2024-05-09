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

の2点です。では、戻り通信に問題があるというのはどういうことかというと、バックエンドの状態に異常がない場合はNWのルーティングが間違えている可能性が高いです。
この想定でルートテーブルの確認をしてみます。

![](https://storage.googleapis.com/zenn-user-upload/a1ea87ee2493-20240509.png)

VPCのコンソールからWebApp-VPCを選択し、リソースマップを確認すると、**WebApp-ALB1-b**のルートテーブルだけ他のALBサブネットと比べると**App-RTB**に紐づいていることが分かります。
この**App-RTB**を選択すると、デフォルトルートがNATGWに向いているため、非対称通信となりタイムアウトが発生していそうです。

サブネットを選択し、「ルートテーブルの関連付けを編集」から**WebApp-Public-RTB**を選択して保存します。
再度CURLコマンドを複数回実行して、3つのIPアドレスに対して接続確認ができればこの章は完了です。


# Issue２
次のシナリオは、Cloudwatchアラームを確認します。ELBのunhealthyHostCountAlarmがアラーム状態になっているので、これを解決していきます。

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

まず、504エラーが起きる原因としては、



# Issue4


# Issue5


# Issue6


# Issue7


# Issue8




# リンク

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-1

https://zenn.dev/nnydtmg/articles/aws-handson-troubleshooting_in_the_cloud-2-1
