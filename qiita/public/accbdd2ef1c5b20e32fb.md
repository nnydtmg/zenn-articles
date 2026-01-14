---
title: NLBのNW要件を検証してみる
tags:
  - AWS
  - 初心者
  - TypeScript
  - aws-cdk
  - CDK
private: false
updated_at: '2023-02-10T21:49:21+09:00'
id: accbdd2ef1c5b20e32fb
organization_url_name: null
slide: false
ignorePublish: false
---
# やりたいこと

ふとしたきっかけで、AWSのドキュメントで気になる部分があり、CDKの練習を含んで検証してみようと思いました。
その部分とは、NLB(Network LoadBalancer)の[ホワイトペーパー](https://docs.aws.amazon.com/ja_jp/elasticloadbalancing/latest/network/network-load-balancers.html)のこの部分です。

> 要件
> * インターネット向けロードバランサーの場合、指定するサブネットには最低 8 個の利用可能な IP アドレスが必要です。内部ロードバランサーの場合は、 AWS がサブネットからプライベート IPv4 アドレスを選択する場合にのみ必要です。
> 
> * 制約のあるアベイラビリティーゾーンにあるサブネットを指定することはできません。エラーメッセージは、「'network' タイプを使用したロードバランサーは az_name でサポートされていません」です。制約されていない別のアベイラビリティーゾーンにあるサブネットを指定し、クロスゾーン負荷分散を使用して、制約されているアベイラビリティーゾーンのターゲットにトラフィックを分散することはできます。
> 
> * ローカルゾーンでサブネットを指定することはできません。

普段はIPを固定して設計しているので、最低8個という要件をあまり気にしていませんでしたが、記載があるならそうなのか？？？

ということで、検証してみようと思います。


# 結論

結論からいうと、ホワイトペーパーにある通りでした！（当たり前ですね笑）
* IPを指定する場合は、1つでも空きがあればOK
* AWSにお任せする場合はNG


# 前提

Network周りのリソースとSubnetのIPを埋めるためのEC2インスタンスはCDKで定義しようと思います。
基本的なソースはこちら

https://github.com/nnydtmg/aws-nlb-ip-requirements-check.git


VPC・3PrivateSubnet・EC2 10台を構築します。
/28のサブネットを作成しているので、5台ずつaz-a,az-cに構築しています。
空いているIPは6つなので、要件としてはNGのはずです。


# NLBの構築

## NGになる方

IPv4 settingsの部分で、`Assigned from CIDR 10.1.0.0/28`を選択します。
（ターゲットグループなどは事前に作成しています。）

![01_nlb.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/679884/e9514e59-53c4-3939-43ca-d51a9ae8d866.png)
![02_nlb.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/679884/9939eaad-0c8b-7c74-00e7-6190f156ddca.png)

`Not enough IP space available in subnet-******.ELB requires at least 8 free IP addresses in each subnet.`というエラーが出てます。
ホワイトペーパーの通りAWSがIPを定義する場合はダメなようです。


## OKになる方

IPv4 settingsの部分で、`Enter IP from CIDR 10.1.0.0/28`を選択します。
空いているIPを適当に入力してデプロイしてみます。

![03_nlb.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/679884/38eab33a-25c1-6655-39f3-cc92c4da9983.png)
![04_nlb.png](https://qiita-image-store.s3.ap-northeast-1.amazonaws.com/0/679884/4496a061-263d-a416-5cdb-3f7448955c59.png)

`Successfully created load balancer`と出てデプロイ出来ました。
ホワイトペーパーの通り自身でIPを指定する場合はOKなようです。


# 最後に

普段よく使うサービスでもしっかりとドキュメントを読むと、意外と理解できてない部分がありますね。
こういう部分を簡単に検証できるのもパブリッククラウドの利点ですね！

CDKのコードを綺麗にかけるようになりたいです。。

以上です、お読みいただきありがとうございます！！
