---
title: "Cloudflare Meetup Tokyoに参加しました"
emoji: "🗂"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare","meetup"]
published: true
---
# はじめに

2023年4月25日にCloudflareのTokyo Meetupがあり、亀田エバンジェリストも登壇されました。
Cloudflareの考え方や仕組み、使い方をLTやハンズオンで学ぶことができました。
簡単にですが、参加した感想を書きたいと思います。


# イベント概要

https://cfm-cts.connpass.com/event/275461/

# タイムテーブル

|時間|内容|登壇者|
|:--|:--|:--|
|18:15~|受付開始||
|19:00~19:10|オープニング/会場説明|運営　山口正徳|
|19:10~19:30|Cloudflareとは|Cloudflareエバンジェリスト　亀田治伸|
|19:30~19:45|Cloudflare workers/pagesとは|運営　森茂洋|
|19:45~20:00|事例：デジタル待合室の事例|運営　武田可帆里|
|20:00~20:50|ハンズオン|運営　新居田晃史|
|20:50~21:00|クロージング|運営　新井雅也|


# 亀田さんのCloudflare話

Cloudflareについて会社としての考え方や、高速にセキュアな通信を実現するための内部的な構造をお話しいただきました。

Cloudflareはインターネット全体の高速化をセキュアに実現するために、ネットワークを提供する会社で創立はまだ13年目です。
CDNが有名ですが、最近はエッジコンピューティングサービスも提供しており、多くのサービスが無料で使えます。もちろん有償プランもあります。
現在全世界の20%のトラフィックがCloudflareを通ると言われていて、かなりの流量がすでにCloudflareにはあるということです。
Cloudflareは大規模なデータセンターを持たず、エッジデータセンターを世界285都市で運営し、海底ケーブルの引き上げ場所にPoPを設置して、いわゆるリージョンレスという構成をしています。よりCloudflareのネットワークに入ってくる初期の段階でトラフィックを処理して、セキュアな通信のみをユーザーのオリジンに届けることで、目指すインターネットを実現しようとしています。

壮大な野望(?)を掲げて世の中のインターネットをよりよくするために、様々なサービスを世に展開していることがよくわかりました。

過去にハンズオンをしたことはありましたが、まだまだ理解していない仕組みが隠されているんだなぁと思ったので、もっと知りたい！となりました。

資料が展開されればリンクしようと思ったのですが、まだ公開されてないので、ぜひ機会があれば生で聞きに行って見てください。

# 森茂さんのpages/workers

workersはCloudflareを象徴するようなサービスで、エッジ環境をオリジンにするようなイメージで、コンピュート環境を利用できるものです。
アイデア次第で無限大の可能性があるサービスです。
ただし、JavaScriptのみといった制限はありますので、詳細は要確認です。

データストレージも充実していて、key-value型で結果整合性を持つ `workers-KV`、Amazon S3互換の`R2`、強整合性でリアルタイムデータに最適な`Durable Objects`、エッジで動作するSQLiteな`D1`、キューイング・メッセージングサービスの`Queues`があります。
特にR2はCloudflareは下り通信も無料なので、非常に注目度の高いオブジェクトストレージです。

pagesはGitベースのデプロイフローをもつ、Jamstackサイトを構築ホストする環境として利用できるものです。AWSでいうAmplifyのようなイメージですね。
最近はpagesで基本的にはデプロイが一通りできるようになってきている。

登壇資料はこちらから参照できます。ユースケースは必見です。

https://speakerdeck.com/himorishige/workerstoha



# 武田さんの待合室の話

自治体向け予約システムを提供していたが、コロナのワクチン予約の一斉通信のトラフィック処理に困っていたが、クラスメソッドさんが提供を開始したCloudflareを使ったwaiting roomサービスを利用して、簡単に素早くリリースできたという事例をお話ししていただきました。
Waiting room自体のサービスもすごいですが、当時のゴタゴタの中で素早く導入を決めてリリースした苦労やポイントが聞けて非常に面白かったです。

設定方法や実際に利用する中での注意点が綺麗にまとまっていてとてもわかりやすかったです。

https://speakerdeck.com/taketakekaho/anoqing-shu-bai-zi-zhi-ti-nokoronawakutin-yu-yue-huomuwojiu-tutawaiting-roomnoyun-yong


# ハンズオン

ハンズオンは以前ブログでも紹介した、亀田さんのZenn記事を実際にその場でやっていました。
当日新たにVSCodeのDev Containerで実行しようとしたところ、wrangler loginで躓いたので、別途記事にしてみようと思います。

ハンズオン資料はこちらです。

https://zenn.dev/kameoncloud/articles/1fac9762aab4ec

https://zenn.dev/kameoncloud/articles/7236a2c6ad35c0



# 最後に
Cloudflareの勢いを感じられ、オフラインのMeetupもだんだんと復活してきてとても良い会でした。
次回以降もぜひオフラインで参加していきたいです。読んでみて興味が湧いた方もぜひご参加ください！

Cloudflare Tunnelについてもとても興味が出てきているので、今後しっかりと調べてみようと思います。



