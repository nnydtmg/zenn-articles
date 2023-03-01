---
title: "Cloudflareに入門してみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["Cloudflare","cloudflare","Tech","入門"]
published: true
---

# Cloudflareとは

「Help us build a better Internet」という理念のもと、世界のネットワークをよりよくするためにグローバルに展開するクラウド企業です。
全世界の20%の通信を管理しているという点から見ても、今後かなり拡大が期待される会社ですね。


# 触ってみる

今回触る範囲は[Serverkess Meetup Japan Virtual #26](https://serverless.connpass.com/event/274263/)でエヴァンジェリストの亀田さんがデモで見せてくれていた範囲です。
気になる方は、Youtubeで公開されているのでぜひご覧ください。


## 触るサービスに関して

ドメイン以外の部分で利用するサービスについて簡単にまとめてみます。


### Workers

Cloudflareがグローバルに展開するエッジ環境でJavaScript等を実行する事ができるサーバレスコンピューティングサービス。
AWSでいうAWS Lambda@Edgeのようなものですが、コールドスタートが一切ないので、高速に利用することができる。
公式ドキュメントは[こちら](https://developers.cloudflare.com/workers/)。


### KV

サーバレスKey-Valueストアで275以上のグローバル拠点で利用可能なサービス。
AWSでいうDynamoDBだが、自動でグローバルに結果整合性を保った状態で展開される。
公式ドキュメントは[こちら](https://developers.cloudflare.com/workers/runtime-apis/kv/)。


## アカウント作成

基本的に料金は無料で利用できるので、クレジットカード登録がいらないのがまずびっくりです。
まずは、[Cloudflareのサイト](https://www.cloudflare.com/ja-jp/)にアクセスすると、右上にサインアップの表示があるのでクリックします。

|![](https://storage.googleapis.com/zenn-user-upload/907c91fa8489-20230301.png)|
|:--|

必要情報を入力します。といってもメールアドレスとパスワードのみです！

|![](https://storage.googleapis.com/zenn-user-upload/e43835624bf4-20230301.png)|
|:--|

すると、ログイン完了です。

|![](https://storage.googleapis.com/zenn-user-upload/43679406f69d-20230301.png)|
|:--|


## ドメイン取得（有料）

この部分は有料になりますので、ご注意ください。
もしご自身で持っている物があれば、移管してください。

左ペインから「ドメインの登録」から希望のドメインを入力します。すると、候補が表示されるので、希望のドメインを選択します。

|![](https://storage.googleapis.com/zenn-user-upload/f698fe7d489b-20230301.png)|
|:--|

必要情報を入力して「登録社情報を入力する」をクリックすると、購入方法の選択が出てくるので入力して購入します。

|![](https://storage.googleapis.com/zenn-user-upload/14a0f407e132-20230301.png)|
|:--|

しばらくすると、左ペインのドメインの管理から、ドメインを取得出来ていることが分かります。

|![](https://storage.googleapis.com/zenn-user-upload/636c7d400de5-20230301.png)|
|:--|


## Workersでサービスを立ち上げる

ドメインを取得出来たら、実際にサービスを立ち上げてみましょう。
とりあえずWorkersでHello Worldしてみます。

デプロイはとても簡単です。
左ペインのWorkersから「サービスを作成」をクリックします。

|![](https://storage.googleapis.com/zenn-user-upload/adae24583984-20230302.png)|
|:--|

サービス名を任意に入力して、HTTPハンドラで簡単なFetchが出来るようにします。
サービスの作成をクリックするだけで、デプロイされます。

|![](https://storage.googleapis.com/zenn-user-upload/f3e5320ac8bd-20230302.png)|
|:--|

確認すると、、、出来てます。簡単すぎますね。。

|![](https://storage.googleapis.com/zenn-user-upload/cf1f7cc7b729-20230302.png)|
|:--|

プレビューのドメインをクリックすると、実際にHello Worldが表示されることが確認できます。

|![](https://storage.googleapis.com/zenn-user-upload/66988993db5d-20230302.png)|
|:--|

次に、自分のドメインでのアクセスを可能にするために、CNAMEを設定します。
左ペインのWebサイトを選択し、作成したドメインを選択します。

|![](https://storage.googleapis.com/zenn-user-upload/d4ef985dcbb0-20230302.png)|
|:--|

左ペインのDNSから、先ほどのnnydtmg.workers.devドメインへCNAMEを登録します。

|![](https://storage.googleapis.com/zenn-user-upload/cec39adc6925-20230302.png)|
|:--|

|![](https://storage.googleapis.com/zenn-user-upload/7c54bc083b9d-20230302.png)|
|:--|

登録出来ました！！！

が、実はこれだけではアクセス出来ません。
Workerのページでルート設定が必要です。
サービスのページから、ルートを選択します。少しわかりにくいですね、、

|![](https://storage.googleapis.com/zenn-user-upload/0d38118ed30b-20230302.png)|
|:--|

ルート追加を選択し、ゾーンに対してルートを設定します。

|![](https://storage.googleapis.com/zenn-user-upload/b5b58431f6b7-20230302.png)|
|:--|

追加出来ました。

|![](https://storage.googleapis.com/zenn-user-upload/0dde8fc9a0a7-20230302.png)|
|:--|

では、自分のドメインでアクセスできるか確認してみましょう！

|![](https://storage.googleapis.com/zenn-user-upload/30de05c3478e-20230302.png)|
|:--|

出来ました！
これだけで自分のドメインを使って簡単なWEBページを構築できるのは、他のクラウドサービスと比べてもかなり楽だなと思います。
しかも、リージョンレスでグローバルにデプロイされるので、なかなかのインパクトを感じます。


# 最後に

今日の入門ハンズオンを超えて具体的な物を作りたい！という方は、亀田さんがzennで記事を出していただいているのでそちらも実践してみてください。

https://zenn.dev/kameoncloud/articles/7236a2c6ad35c0

KVを使った簡単なTodoアプリが作れます。



