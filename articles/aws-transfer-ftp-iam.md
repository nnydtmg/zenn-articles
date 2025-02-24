---
title: "AWS Transfer for FTPを完全閉域環境で使う際の注意点"
emoji: "😺"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","FTP","IAM"]
published: false
---
# はじめに
みなさんは、AWS上に閉域環境でシステムを構築したことはありますか？
ここで言う閉域環境とは、VPC内にパブリックサブネットがない・デフォルトルートが設定されていない状態を想定しています。
最近、この閉域環境内に`AWS Transfer Family for FTP`を使用して、オンプレミス環境からファイル転送を実現しようとした際に、ちょっとしたハマりごとがあったので、自分自身の備忘として残しておきます。

# 先に結論
まずは先に結論だけ書いておきます。ここで理解できた方は読み飛ばしてください！

:::message
エンドポイントからSTS向けの通信ができるようにする！
:::

1. Transfer FamilyのエンドポイントはFTPサーバーの役割をする
2. S3・EFSへファイル転送を行うにはIAMの権限が必要
3. つまりエンドポイント（FTPサーバー）からSTSへの通信ができるようにする必要がある

これらがどういうことかを順にご説明していきます。


# Transfer Familyとは
Transfer Familyとは、`FTP`や`SFTP`といったファイル転送とデータ管理をAWSがマネージドに提供しているサービスです。
FTPやSFTPを使用して、S3かEFSに対してファイルを転送するためのサーバーの役割をしてくれたり、SFTPコネクタを使用して外部へのファイル送信をすることも可能です。
また、最近は`Transfer Family ウェブアプリケーション`という、WebUIを提供してファイル共有をするサービスも出てきています。

https://aws.amazon.com/jp/aws-transfer-family/

今回はFTPを使用してファイル転送する際にはまったポイントをお伝えできればと思います。

なお、FTPで使用できるのはパッシブモードのみで、ポート設定も若干特殊なのでご注意ください。
プロトコル制限は[こちら](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/transfer-file.html)の記事をご確認ください。
> ファイル転送プロトコル (FTP) と ではFTPS、パッシブモードのみがサポートされています。

ポート制限は[こちら](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/create-server-ftp.html)をご確認ださい。
> FTP Transfer Family の サーバーは、ポート 21 (コントロールチャネル) とポート範囲 8192～8200 (データチャネル) で動作します。

また、FTPのユーザー認証には、IDプロバイダーとしてディレクトリサービスかLambdaやAPI Gatewayを使うカスタムIDプロバイダーのどちらかを設定可能です。SFTPではマネージドIDとしてユーザー設定ができますが、FTPではできないので注意が必要です。


# 検証
## 今回の初期構成
今回は以下の構成を前提に記事を書いていきます。

![](/images/aws-transfer-ftp-iam/01_architecture.png)

擬似的にClient-VPCにオンプレミス環境のFTPクライアントを模したEC2サーバーを配置し、Transfer for FTPが閉域環境内に構築されている状態にします。また、この時Transfer for FTP以外のエンドポイントは現時点では作成しません。
Transfer for FTPは[カスタムIDプロバイダー](https://docs.aws.amazon.com/ja_jp/transfer/latest/userguide/custom-identity-provider-users.html)を使用して、ID/PW認証をします。


## ベース環境構築
VPCの構築は構成図の通り行います。
Client-VPCとFTP-VPCはIPリーチャブルなCIDRで構築し、VPC Peeringで接続します。

FTP-VPCのCfnテンプレートは[こちら](https://github.com/nnydtmg/aws-cloudformation-templates/blob/main/01.aws-vpc-nopublic.yaml)です。
Client-VPCのCfnテンプレートは[こちら](https://github.com/nnydtmg/aws-cloudformation-templates/blob/main/02.aws-vpc-nopublic-ec2.yaml)です。ご参考まで。

Client-EC2に関しては事前準備として、Client-VPCにはInstance Connectエンドポイントを作成し、インスタンスにSSH接続できるようにしておきます。また、Amazon Linux2023にはFTPクライアントが入っていないので、S3のGatewayエンドポイント経由でdnfインストールできるようにしています。
ここは本題と異なるので省略しています。詳しくは[こちら](https://repost.aws/ja/knowledge-center/ec2-troubleshoot-yum-errors-al1-al2)の記事をご覧ください。
（今回はコスト優先でこの構成にしましたが、手間に感じる方はパブリックサブネット+NAT Gatewayの構成で作成してください。）


## Transfer for FTPの構築







