---
title: "AWSのルートテーブル伝播について"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","vpc","nw"]
published: true
---
みなさんはVPCを構築した際に、ルートテーブルのサービスページに「**ルート伝播**」という文言を見て理解できたでしょうか。

私はできませんでした！

そもそもNWが本業ではなく、サーバ基盤の設計構築しかしていなかったので、馴染みのない言葉である上に設定する場面が割と限られているため、あまり設定する場面がないのですが、たまたま調べなおしたのでまとめておこうかと思います。

なお、前提としてNWの知識も若干含みますが、専門ではないのでぜひ補足をいただけると嬉しいです。

# NWの仕組み
まずはNWがどのようにして疎通できるようになっているかを簡単におさらいしておこうと思います。
要素としては、[OSI参照モデル](https://ja.wikipedia.org/wiki/OSI%E5%8F%82%E7%85%A7%E3%83%A2%E3%83%87%E3%83%AB)でいう、L2/L3/L4をメインに見ていきます。俗にいう「アプセトネデブ」の「トネデ」の部分ですね。

今回は以下の構成をメインに考えていきます。

![](/images/aws-route-propagation/intro-01.png)

***PC-A*** から***PC-B*** に疎通する場合、PC-A側のNWレンジにPC-Bがないので、アドレスが分からないとなってアクセスできません。
ではどのようにアクセスするかというと、その間にあるRouterに対してアドレスを問い合わせます。このとき自身の所属するNWレンジ外への通信を外部のNWにつなぎに行くために出入り口になるのが、デフォルトルートに指定されるルーター(Router1)になります。
そのRouterが目的の宛先を知っていれば、そのRouterに転送して、さらにその先のRouterが知っていれば転送していくという形で、数珠つなぎに転送されていきます。知らない場合は、先ほどと同様デフォルトルートに指定されたルータ等に転送されます。最終的に目的のアドレスが見つかると、実際に通信が開始されるという仕組みです。
なので、***PC-A*** から***PC-B*** であれば、192.168.20.0/24を知っているRouter-4に転送し、そのレンジの中で192.168.20.1があるので疎通ができるようになります。


# ルート伝播とは
さて、本題となるルート伝播についてはオンプレミスとAWSをつなぐより大きな構成で考えていきます。
![](/images/aws-route-propagation/architecture-01.png)

この構成の場合、オンプレミスとAWSをDirectConnectを使って、TransitGWやVirtualGWをVPCに紐づけていくのが一般的ではないかと思います。
この時に、オンプレミスのサーバーからAWS内のEC2にアクセスするためには、EC2がどこにあるのかを伝えていかないといけません。

逆も然りで、EC2からオンプレミスのサーバにアクセスするためには、オンプレミスのアドレスに対してルートがないと通信が到達できない状態になります。

通常は、個別のサブネットにアタッチしているルートテーブルに対して、個別にルーティングを設定する必要があります。TransitGWを使っている場合はデフォルトルートをTransitGWに向けることで細かなルーティングをTransitGWに担わせるということも可能ですが、一般的には内部の通信のみTransitGWに転送することの方が多いのではないでしょうか。
そうすると、以下の例のように接続先が増えるごとに各VPC/サブネットのルートテーブルを更新する必要があり、とてもじゃないですが管理しきれません。

![](/images/aws-route-propagation/architecture-02.png)

そんな時に「***ルート伝播を有効にする***という設定を有効にしていれば、対象のVPCの外側にTransitGWやVGWで接続されているNWが増えた際に、自動的にサブネットのルートテーブルを追記してくれます。

例えば、オンプレミス側に新規に172.16.0.0/12というNWレンジが追加され、DXに接続されたとすると、このレンジ宛のルートが自動的に192.168.0.0/24のサブネットのルートテーブルに追記されることになります。


# まとめ
簡単になりますが、イメージとしては「ルート伝播する」という設定というよりは、VGWが新たに入手した接続先情報を対象のVGWがアタッチされているサブネットの「ルートテーブルに伝播する許可を与える」というイメージでしょうか。

NW周りのサービスはNWの基本が押さえられないと理解しづらい部分ではあるので、私もざっくりとした理解の上で記事にしています。より詳細な解説があればぜひコメントなどで教えていただけると嬉しいです！