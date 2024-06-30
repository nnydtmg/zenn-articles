---
title: "AWSでサブドメインを別アカウントに委任する"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","route53",]
published: false
---

# はじめに
皆さんはドメイン管理をどのように行なっていますか？
私は個人用のドメインをCloudflareで取得し、様々なツールで利用するような構成にしています。
また、AWSアカウントは[Organizations](https://aws.amazon.com/jp/organizations/)を設定し、複数環境を用途別に使っています。

こういった構成の上で、AWSのrootアカウントでAWS全体用のサブドメインでホストゾーンを作成し、子アカウントでそのサブドメインのさらにサブドメインを利用して証明書を発行したい場面に遭遇したので、自分のメモ用に整理しておきます。

# 前提
前提として、Cloudflare側でドメインを取得している状態とします。
今回は例として以下のドメイン構成を考えます。
* Cloudflare
    * ***example.co.jp*** 
* AWSのrootアカウント
    * ***aws.example.co.jp***
* AWSの子アカウント
    * ***sample1.aws.example.co.jp***
    * ***sample2.aws.example.co.jp***


## AWSのrootアカウント側での対応①
まずはAWSのrootアカウント側での対応を整理します。
利用したいサブドメイン(aws.example.com)でパブリックホストゾーンを作成します。
NSレコードが発行されるので、これをCloudflare側に登録します。

![](https://storage.googleapis.com/zenn-user-upload/09318d5fe484-20240630.png)


## Cloudflare側での対応
私はCloudflareにドメインを登録しているので、Cloudflareで作業をしていますが、他のツールを使っている場合も基本的には同じです。

なお、登録方法は以前記事にしているのでそちらをご参照ください。

https://zenn.dev/nnydtmg/articles/aws-rocketchat-cfn

ここまででAWSのrootアカウント側のサブドメイン(aws.example.com)での対応は完了です。この状態でAWSのrootアカウントのACMでパブリック証明書を発行するとDNS検証が成功すると思います。

## AWSの子アカウント側での対応
次はAWSの子アカウント側での対応です。
rootアカウントでの対応と同様に、任意のサブドメイン(sample1.aws.example.co.jp)を指定してパブリックホストゾーンを作成します。
NSレコードが作成されるので、これをAWSのrootアカウントのRoute53にレコード追加します。

## AWSのrootアカウント側での対応②
サブドメイン(aws.example.com)のパブリックホストゾーンにレコードを追加します。
名前を指定したいサブドメイン(sample1)、レコード種別をNSにし、出力されている4つのNSレコードをそのままペーストするだけです。

![](https://storage.googleapis.com/zenn-user-upload/fbe7b4237856-20240630.png)

この状態で子アカウントでサブドメインでの証明書発行が成功できれば設定は完了です。


# 最後に
簡単な記事になりましたが、意外と設定する場面が少なく忘れがちなので備忘として残しておきます。
ちなみに、子アカウント内でさらにサブドメインを利用してアプリを公開したいような場合は、証明書を 「*.example1.aws.example.com」で取得するようにすると、www.example1.aws.example.comのようなドメインで利用できるようになります。


