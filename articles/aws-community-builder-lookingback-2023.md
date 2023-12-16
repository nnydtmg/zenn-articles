---
title: "AWS Community Builderになっての数ヶ月を振り返る"
emoji: "🌟"
type: "idea" # tech: 技術記事 / idea: アイデア
topics: ["aws","communitybuilder"]
published: false
---
![](https://storage.googleapis.com/zenn-user-upload/a670b85ae710-20230827.png)

この記事は「[AWS Community Builders Advent Calendar 2023](https://qiita.com/advent-calendar/2023/aws-community-builders)」の18日目の記事です。ぜひ最後まで読んでいただき、他の方の記事も一緒に読んでいただけると嬉しいです！


# AWS Community Builderとは
こちらに関しては選出していただいた際にブログ記事を書いていますので、こちらもご覧いただければと思います。
https://zenn.dev/nnydtmg/articles/aws-community-builder

簡単に言うと、AWSがアウトプットを通してAWSの普及・利用に貢献していると認めたユーザーに対して、様々なサポートをしてくれるというプログラムです。AWSが好きな人、AWSを利用している人にとっては非常に嬉しい特典が目白押しなので、興味のある方はぜひ記事を読んで、次回以降の認定に向けたWaiting Listに登録しておくのが良いと思います！


# 半年間の活動
簡単にではありますが、認定をいただいてからの活動を振り返ろうと思います。
所感としては業務やプライベートとのバランスがあまりうまく取れなかったので、他の方々の活動量には本当に驚かされますし、大尊敬しています。

## ブログ
こちらはあまり書けなかったので超反省点です。
来年は月一は最低でも書けるようにしたい！そしてもっと技術的な記事が書けるように、もっともっとAWSを使い倒そうと思います！

### AWS上でRocketChatを作るCloudFormation Templateを作ってみた

こちらの記事はCloudflareのDNS設定で他の方へのアドバイスに使えたので、書いておいてよかったなと思いました。

https://zenn.dev/nnydtmg/articles/aws-rocketchat-cfn

### Amazon BedrockがGAされたので、触ってみた

こちらの記事はBedrockがローンチされてすぐに書いた記事で、この後かなり使う場面が増えたので後続記事を書こうと思いながら書けていないので、Agents等も含めて記事にしたいと思っています。

https://zenn.dev/nnydtmg/articles/aws-bedrock-workshop

### JAWS Festa 2023に参加してきました！

こちらの記事はJAWS Festa 2023に現地参加した思い出記事です。初めてJAWSの大規模イベントに参加して、しかもそれが福岡という印象的な会で、これ以降もどんどんイベント参加していきたいと強く思いました。思い出しても最高のイベントでした！

https://zenn.dev/nnydtmg/articles/aws-jawsfesta2023

## 登壇
### めぐろLT会 #8
10/26にオフラインで開催された[めぐろLT会](https://meguro-lt.connpass.com/event/295777/)での登壇です。
Terraformの話をしましたが、他にはWeb系の開発話や学生の登壇者など多様な参加者がいらっしゃって、普段のJAWSとはひと味違う雰囲気でとても面白かったです。機会があればまた参加したいなと思います。

https://speakerdeck.com/nnydtmg/awsdeterraformchao-ru-men

### JAWS-UG東京 ランチタイムLT会 #4
10/30には、JAWS-UG東京の[ランチタイムLT会](https://jawsug.connpass.com/event/298739/)で登壇させていただきました。
この月にリリースされたTerraformv1.6でのTestコマンドについて話しましたが、「CIに組み込みたい」や「使ってみよう」というフィードバックをいただいて、とても嬉しかったです。もっとAWSに寄った話を入れればよかったなとも思っていますが、これは後日チャレンジしたいなと思います。

https://speakerdeck.com/nnydtmg/terraform-v1-dot-6-0deshi-meruinhuradan-ti-tesuto

### Fin-JAWS #33
re:Invent 2023期間中の11/29にラスベガス現地で開催された[Fin-JAWS](https://fin-jaws.connpass.com/event/299403/)での登壇です。
金融系の会社で働いていて、周囲から普段聞かれることや自身が感じる部分をノリと勢いで登壇したものになります。。自分自身がコミュニティに出るようになって、社内とのギャップを非常に感じ、もっと人生豊かに社会人生活を送るためにも必要なのでは？と思うことを発表してみました。

https://speakerdeck.com/nnydtmg/jin-rong-xi-jtcenziniakosokomiyuniteinixing-ke


### AWS LT会 #2
アメリカから帰ってすぐの12/6にオンラインで行われた[AWS LT会](https://aws-likers.connpass.com/event/301604/)での登壇です。
普段インフラメインの業務なので、Lambdaを使い倒すようなことがなかったのですが、とある案件でLambdaの設計をすることになり設定値を一通り抑えた時の経験をLTにしたものです。
意外と知らない設定やアナウンス前のコンソール統合に気付くなど、驚きの多いLTで印象的でした。

https://speakerdeck.com/nnydtmg/inhuradan-dang-zhe-galambdanoshe-ding-zhi-wojin-du-zheng-li-sitemita


## その他
### 社内
社内で毎週の週刊AWSを振り返る勉強会をお昼30分で続けています。その中でアップデート以外に15分ほどのトピックを取り扱って、AWS以外にも興味を持っていただこうと頑張りました。これは非常に自分自身の勉強にもつながったので、強制的にでもそういった場面が用意されるのは良いことだなと感じています。

### re:Invent
Community Builderの特典としてre:Inventのカンファレンスパスの割引を受けられるので、それを使って現地参加してきました！
社内からも複数人派遣されていたのですが、私は去年参加させていただいたので今回は参加できず、Community Builderになっていて良かったなと実感しました。
さらに、Community Builder向けのご飯会が用意され、海外のメンバーと話をする機会があったりと、本当にCommunity Builderの特典を存分に感じられました。現地に参加する機会があれば、絶対に海外の方とのコミュニケーションをとって欲しいなと思います。世界が変わります！

# 来年の目標
まずは来年の更新に向けて引き続きアウトプットを出していきたいと思います！

* 月一以上のブログを書く
* 四半期に一回は登壇する

この辺りをラインに頑張ります。

また、自分自身の環境も大きく変わるので、うまく適応しつつもっとAWSにコミットしていきたいと思います。コミュニティ活動も積極的に参加して知見を広げて、楽しく全力で駆け抜けたいと思っていますので、お会いした際にはぜひよくしてください！
