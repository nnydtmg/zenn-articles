---
title: "AWS CloudFrontでメンテナンスページに切り替える方法"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","cdk","cloudfront"]
published: false
---

# はじめに
とある案件でAWS上でCloudFront + S3 + ALBの構成でWEBサイトホスティングを実装している時に、「***特定の時間帯はメンテナンス用のページを表示したい***」という業務要件が出てきました。
単純にALBのリスナールールを切り替えることで、CloudFrontにエラーコードを返しS3内のメンテナンスページにリダイレクトする方法かなと考えたのですが、そもそも他に方法がないのか気になったので検証してみました。

## 今回の構成
今回題材にする構成は以下のような構成となっています。(なお案件での構成とは異なり、簡略化しています。)

![](/images/aws-cloudfront-maintenancepage/intro.png)

以下の簡易的な要件のもと、メンテナンスページを表示する構成を考えていきたいと思います。
* CloudFront + S3で静的サイトホスティング(SPA)
* APIはALBを経由してEC2上のアプリケーションでホストする
* ALBはHttps化する
* CloudFrontをHttps化するため証明書はus-east-1で取得する
* CloudFrontにWAFをアタッチしてフィルタリングを行う
* メンテナンス時はS3内のメンテナンス用の静的ファイルを表示する
* メンテナンス時は *index.html* への遷移はなく、直接メンテナンス用HTMLを表示する
* メンテナンスページは時限で表示・非表示を行う
* アクセスエラーの時はエラーページに遷移するようにする
* 時限は厳密ではなく、5分程度のラグは許容できる

構成案としては以下のパターンがあるのではないかと考えています。
1. ALBのリスナールールを変更して特定の時間にカスタムレスポンスを返すようにする
2. ALBのリスナールールを変更して特定の時間にエラーレスポンスコードを返し、CloudFront側でエラーページの設定を行う
3. WAFのルールを変更して任意の通信をブロックし、CloudFront側でエラーページの設定を行う
4. CloudFrontのデフォルトページを切り替える

今回、基本的な環境はのんピさん(@non____97)の[記事](https://dev.classmethod.jp/articles/aws-cdk-cloudfront-s3-website/)を参考にさせていただきました。いつもお世話になっていますm(_ _)m
:::message
なお、こちらはCloudFrontのHttps化のためバージニアリージョンでの証明書作成が必須となるため、デフォルトアカウントを`us-east-1`にして実行するとスムーズに構築できるかと思います。東京リージョンLoverはご注意ください。
:::

# 結論




# 実際の挙動
## ALBのリスナールールで特定の時間にカスタムレスポンスを返すようにする
まずはCDKで構築した環境にALBのみ追加します。(本来はEC2などで正しくレスポンスを返すのが良いですが、今回は簡略化しています。)
ALBを作成後はCloudFrontのビヘイビアとオリジンにALBを指定しておきます。
次にALBのリスナーページで正常レスポンスのルールとメンテナンス用のルールを作成します。

![](https://storage.googleapis.com/zenn-user-upload/63553f6b180e-20240707.png)

まずは正常なレスポンスの場合を確認します。想定通り200のレスポンスを返しています。

![](https://storage.googleapis.com/zenn-user-upload/2374caf96803-20240707.png)

次にルールの優先順位を変更してみます。

![](https://storage.googleapis.com/zenn-user-upload/7ad8d42cbd6d-20240707.png)

想定通りメンテナンス用の固定レスポンスが表示されました。
ここにメンテナンス用のHTMLをベタ書きしても良いですが、リッチなものであればリダイレクトしても良いかと思います。

![](https://storage.googleapis.com/zenn-user-upload/3db1c7702636-20240707.png)

ここまででALBのみでメンテナンスレスポンスを返す動作を確認できました。


## ALBのリスナールールを変更して特定の時間にエラーレスポンスコードを返し、CloudFront側でエラーページの設定を行う
先ほどのノーマルHTMLではなく、きちんとしたメンテナンス用のページを表示したい場合を検証します。
まずはリスナールールを元に戻しておきます。
CloudFront側のエラーページの設定で503の設定を追加します。503のレスポンスの場合はS3内に配置した`maintenance.html`を表示するようにします。

![](https://storage.googleapis.com/zenn-user-upload/86fa1e95b15a-20240707.png)

この状態で再度検証してみます。まずは200エラーが表示されている状態です。

![](https://storage.googleapis.com/zenn-user-upload/2374caf96803-20240707.png)

次にALBのリスナールールを変更して検証します。

![](https://storage.googleapis.com/zenn-user-upload/9daf991be19a-20240707.png)

想定通りメンテナンス用のHTMLを表示してくれています。

## WAFのルールで任意の通信をブロックし、CloudFront側でエラーページの設定を行う




## CloudFrontのデフォルトページを切り替える







# 最後に




