---
title: "AWS VPC LatticeがGAされたので触ってみた"
emoji: "😸"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","Lattice","workshop"]
published: false
---

# AWS VPC LatticeがGAされました

re:Invent2022で発表されていたVPC Latticeが3/31にGA（一般利用）になりました！
東京リージョンでも利用可能です。

https://aws.amazon.com/jp/about-aws/whats-new/2023/03/general-availability-amazon-vpc-lattice/


# AWS VPC Latticeとは何か

AWS VPC Lattice（日本語コンソールでは格子と表現されます）とはVPC向けのリバースプロキシサービスです。
各種コンピュートサービスを接続するELBのようなイメージですが、VPCをまたいで接続する機能が内包されているのが特徴です。
現時点では **HTTPとHTTPS** をサポートしています。
また、ELBでHTTPSのために必要だったTLS証明書が、VPC Latticeでは **デフォルトのDNS名に対応するワイルドカード証明書が用意されます** （カスタムドメインやTLS証明書も利用可能です）。

接続できるサービスとしては、Lambda、EC2 (Auto Scaling Group(ASG)) 、ECS、ALB、VPCがあります。
各コンピュートサービスで独自に作成したメソッドを、アクセス制御等も含めて一律に管理できるといったサービスとなります。


# AWS VPC Lattice Workshopをやってみた

日本語のWorkshopが公開されていますので、実際にやってみました。

:::message alert 

こちらのWorkshopはサービスの利用料がかかるのでお気を付けください。

:::

https://catalog.workshops.aws/handsonwithvpclattice/ja-JP


シナリオとしては、1つのLambdaと2つのEC2（VPC別、Auto Scaling Group設定済）、1つのクライアントVPCを一つのLatticeで接続できるようにするというものです。

<!--イメージ図-->
![](https://storage.googleapis.com/zenn-user-upload/f8631fd0caff-20230429.png)
*全体構成イメージ*

手順の詳細は記載しません。概要だけまとめています。


# STEP1：サービス間通信

この章ではLatticeの基本的な使い方を学びます。
Latticeの構成として、アクセスの上位層から順に、

1. サービスネットワーク
2. サービス
3. ターゲットグループ

が存在しますが、今回は下から順に作成を進めます。
ターゲットグループにはLambdaやEC2を指定しますが、このWorkshopではEC2がASG配下にありますので、ASGをターゲットとして設定します。ここはELBと同じ感覚ですね。

サービスにはリスナールールが存在して、そこにターゲットグループを設定するという形で、ここも完全にELBと同じですね。

サービスが作成できると、サービスネットワークに追加して、サービス間通信が出来るようにします。
こうすることでサービス間のアクセス制御の管理が出来るようになります。

# STEP2：アプリケーションレイヤーセキュリティ




# STEP3：オブザーバビリティ




