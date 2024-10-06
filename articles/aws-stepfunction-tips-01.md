---
title: "AWS Step Functionsでできること・できないこと"
emoji: "💨"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","stepfunction"]
published: false
---

# はじめに
みなさん、ジョブ運用どうされてますか？
一口にジョブと言ってもいろんな定義があるかと思いますが、今回はいわゆるシステムジョブです。JP1やJobCenter、Senjuなどジョブ管理ツールは多数存在しますし、これまでも長く使われてきているかと思います。
しかし、最近AWSをベースにシステム開発をする際に、EC2の運用を減らしたい等の理由でジョブマネージャーサーバーを使わないジョブ運用を考えることが多くなってきました。さらに、新規導入案件などで初期フェーズにバッチ処理自体も少なく先述した製品ライセンスに見合わないシステム規模の場合、AWSでマネージドに利用できる**AWS Step Functions**は第一候補に上がってくることが多いかと思います。

そこで、今回とある業務で実際にAWS Step Functionsを利用して分かった、できること・できないこと・ここが便利・ここが不便等を素直に記録しておきたいと思います。
:::message
あくまで業務の中で詰まったことをベースにしていますので、これ以外にもできる・できないや解決方法はあるかと思いますので、ご参考程度にご覧ください。
:::


# AWS Step Functionsとは
まずはAWS Step Functionsについて簡単におさらいです。
AWS Step Functionsとは、AWSが提供する分散型アプリケーションワークフローサービスです。[AWSサービスと統合されており](https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/supported-services-awssdk.html#supported-services-awssdk-list)、サービスのAPIを簡単に実行することが可能です。
GUIからAWSの各種サービスAPIを並べ替えて、業務に必要なワークフローを構成することができ、定義はJSONで記載することもできますし、GUIで作成したものをJSONやYAMLとしてエクスポートすることも可能です。これによってワークフローをコード管理することも嬉しい部分です。
最近ではCDKやTerraformなどでIaC化している方も多いと思います。それぞれコンストラクトやモジュールがありますので、IaCでの構築ももちろん可能となっています。

AWSだけでなく、3rdパーティのAPIを実行することも可能になり、LambdaレスでHTTP APIを実行することでよりLambdaのランタイム管理などの運用負荷低減につながることにもなります。

基本的な構築方法については、[こちら](https://catalog.workshops.aws/stepfunctions/en-US/)のワークショップを試してみてください。


# 変数操作


# 日付操作


# 






