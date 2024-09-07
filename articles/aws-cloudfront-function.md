---
title: "CloudFront Function v2はかなり使える(かも)"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","cloudfront","waf"]
published: false
---
# はじめに
以前[こちらの記事](https://zenn.dev/nnydtmg/articles/aws-cloudfront-maintenancepage)でCloudFrontで配信しているWEBページをメンテナンス時にメンテナンスページに遷移させるためにどうするか、という記事を書きました。

この時は検討項目に挙げていなかったのですが、CloudFront Function(v2)がかなり使い所がありそうだったので、記事にしてみようと思います。

なお、CLoudFront FunctionとLambda@Edgeの比較については多数の記事が出ていますので、そちらをご参照ください。

# CloudFront Functionとは
CloudFront FunctionとはAWSのエッジロケーションで実行できる、エッジコンピューティングの一つです。
軽量化のためにJavaScriptの一部パッケージ利用に限られるので、かなり利用用途は制限されますが、その中でできるのであればよく比較されるLambda＠Edgeよりもコストや実行時間のメリットがあるので、積極的に使うのが良いのではないでしょうか。

主だった利用用途としては、
1. Headerの書き換え・Cookieの挿入
2. JWTの検証
3. 地理的パスルーティング
4. 簡単なIP制限
5. S3オリジンでのSPA利用時のリダイレクト処理
6. CloudFrontキャッシュヒット率向上を狙うための、キャッシュキーの正規化処理

詳しくは[こちらの記事](https://dev.classmethod.jp/articles/cloudfront-functions-usecases/)が非常にわかりやすいかと思いますので、ご参照ください。

上述の記事の中で、メンテナンス時のページ切り替えや運用拠点からのIP許可はまさにこの用途にぴったりです。


## CloudFront Function ランタイムv2
[CloudFrontのKey Value Store(KVS)](https://aws.amazon.com/jp/about-aws/whats-new/2023/11/amazon-cloudfront-keyvaluestore-globally-managed-key-value-datastore/)がリリースされた(このアップデートがめちゃくちゃでかい)タイミングで、しれっと追加されていた **CloudFront Functions の JavaScript ランタイム 2.0** (CloudFront Functions v2)ですが、これらがCloudFront Functionの利用幅をかなり広げていると思います。

これまでCloudFront Functionを使う際にKVSがなかったので、わざわざLambda＠Edgeを使っていた、と言う方も多いのではないでしょうか。上記のアップデートによって、エッジ環境である程度動的な関数を作成することが可能になりました。また一部のES プリミティブオブジェクトが追加されているので、非常に使い勝手が良くなっています。


# 実際に使ってみた
今回はIP制限、時限(可変)でのメンテナンスページへのリダイレクト(KVS利用)、ヘッダー検証という3つの機能を利用しましたので、簡単にコード例をそれぞれご紹介します。

## IP制限
簡単なコード例です。リクエストの`viewer.ip`をチェックして通信可否を判断し、オリジンへリクエストするかエラーレスポンスを返す動作をします。

```javascript
function handler(event) {
    var request = event.request;
    // アクセス元IPをリクエストから取得
    var clientIP = event.viewer.ip;
    // アクセス許可するIPを設定
    var IP_WHITE_LIST = [
     'aaa.aaa.aaa.aaa',
     'bbb.bbb.bbb.bbb'
    ];
    // アクセス元IPがホワイトリストにあればTrue
    var isPermittedIp = IP_WHITE_LIST.includes(clientIP);

    if (isPermittedIp) {
        // trueの場合はリクエストをそのままオリジンに返す
        return request;
    } else {
        var response = {
            statusCode: 403,
            statusDescription: 'Forbidden',
        }
        // falseの場合はViewerに対してレスポンスを返す
        return response;
    }
}
```

## パス変更・KVS利用
23時〜8時が通常のサイト停止時間で、メンテナンスなどで19時〜8時に変更したいときなどに、これまではCloudFronmt Functionを再度デプロイするか、Lambda＠Edgeを利用するしかなかったのですが、KVSがリリースされたことによって、こKVSの値を書き換えるだけで挙動を実現することができるようになりました。

```javascript
import cf from 'cloudfront'; //ランタイムv2から利用可能に
const kvsId = '<KVS ID>'; // KeyValueStore の ID を記述
const kvsHandle = cf.kvs(kvsId);
function handler(event) {
    // KVSから値を取得
    var startTimeStr = await kvsHandle.get('START_TIME',{format: 'string'});
    var endTimeStr = await kvsHandle.get('END_TIME',{format: 'string'});
    var startTimeNum = Number(startTimeStr);
    var endTimeNum = Number(endTimeStr);

    var currentDate = new Date(Date.now);
    currentDate.setHours(currentDate.getHours() + 9); //JSTに変換
    var currentTimeNum = Number(currentDate.getHours());

    if(startTimeNum <= currentTimeNum || currentTimeNum <= endTimeNum){
        var response = {
            statusCode: 503,
            statusDescription: 'Found',
            headers:{location: {value: 'erroURL'}}
        }
        // メンテナンス時間の場合はerrorURLにリダイレクトするよう設定
        return response;
    }
    return request;
}
```


## ヘッダー検証
PWAとしてWEBアプリを利用していて、そのクライアントアプリからの利用に制限したい場合、`user-agent`ヘッダーなどを利用してアクセス元の検証をすることがあるかもしれません。そう言った場合に、CloudFront Functionでヘッダー検証をして簡易的なWAFのように動作させること
が可能です。

```javascript
function handler(event) {
    var request = event.request;
    // アクセス元IPをリクエストから取得
    var clientHeader = request.headers;
    // アクセス許可するIPを設定
    var HEADER_LIST = [
     'test'
    ];
    // アクセス元IPがホワイトリストにあればTrue
    var isPermittedHeader = (clientHeader['user-agent'].value.includes(HEADER_LIST));

    if (isPermittedHeader) {
        // trueの場合はリクエストをそのままオリジンに返す
        return request;
    } else {
        var response = {
            statusCode: 403,
            statusDescription: 'Forbidden',
        }
        // falseの場合はViewerに対してレスポンスを返す
        return response;
    }
}
```


## その他
### パスの書き換え
SPAではよくあることかと思いますが、仮想ルートに遷移した状態でリロードした場合、実際にはそのパスにコンテンツがないため、403などのレスポンスになってしまいます。それを防ぐために、/index.html以外へのアクセスをすべてindex.htmlに書き換えるという動作が可能です。

### 認証
JWTの検証もできるように、Bearer認証やBasic認証を簡単に導入することが可能です。さらにコード自体へのユーザー情報を記載する必要もKVSの登場でなくなりました。
Cognitoを使うほどでもないユーザー認証であればCloudFront Functionで簡単に導入してしまいましょう。

### 公式の一覧
上記以外にもAWSが提示している使用例がありますので、こちらをご覧ください。
https://docs.aws.amazon.com/ja_jp/AmazonCloudFront/latest/DeveloperGuide/functions-example-code.html

# 終わりに
色々試行錯誤した結果、CloudFront Functionが要件を満たしつつ、コスト的にもメリットがあることがわかりました。
さらに、思ったよりもCloudFront Functionの利用範囲が広く、今後もいいお付き合いができそうだなと感じました。

そこまで話題になることはないですが、CDNを代表とするエッジコンピューティングをうまく使えると、アプリ自体へのメリットもかなり出せると感じましたので、今後は積極的にエッジ活用なども勉強していこうと思います！

