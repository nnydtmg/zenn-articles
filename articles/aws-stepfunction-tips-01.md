---
title: "AWS Step Functionsでできること・できないこと"
emoji: "💨"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","stepfunction"]
published: true
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
変数操作については、**Pass**ステートを利用します。
![](https://storage.googleapis.com/zenn-user-upload/ca70ca74853c-20241012.png)

Passステート内で**Parameters**に変数化したい文字列 or JSON or 数値(後述する注意あり)を設定します。この例では、`Item`という変数に`Test`が入っている状態です。
この`Item`という変数を次のステートで利用することができます。変数を利用する場合は、JSONを操作する形になります。
```json
{
    "Item": "Test"
}
```


![](https://storage.googleapis.com/zenn-user-upload/7cc5681639b1-20241012.png)

JSONを利用する際は、Keyの最後に`.$`、Valueの頭に`$.`をつけなければいけません。
これを実行すると以下のとおり、実行結果出力には先頭に設定した`Test`が出力されていることがわかります。

```json
{
    "InputValue.$": "$.Item"
}
```

![](https://storage.googleapis.com/zenn-user-upload/19d88ccbf396-20241012.png)

ここまでで変数の基本的な使い方は分かったと思います。
では、これをさらに次のステートで利用してみましょう。同じ定義のステートを追加してみます。

![](https://storage.googleapis.com/zenn-user-upload/6ca08c94a548-20241012.png)

これで実行してみると以下のとおり失敗します。

![](https://storage.googleapis.com/zenn-user-upload/8b80b449dc9d-20241012.png)

これは、アウトプットを設定しないと、常に全てを上書きしてしまうからです。
例えば、先述したとおり直前のステートの出力は直後で利用できるので、以下はうまく動作します。

![](https://storage.googleapis.com/zenn-user-upload/2ed86a5228e3-20241012.png)

```json
{
    "InputValue.$": "$.InputValue"
}
```

![](https://storage.googleapis.com/zenn-user-upload/2eca8aeb51e6-20241012.png)

この形で受け渡すことで要件を満たせれば良いですが、さらに後続でも利用したい場面があるかと思います。そんな時には、ステートごとに設定できる **出力(アウトプット)** を利用します。
以下の例では、**ResultPath** に`$.SetEnvValue`と設定しています。

![](https://storage.googleapis.com/zenn-user-upload/891485b4ae1c-20241012.png)

こうすることで、`SetEnvValue`がJSONキーとなって後続に受け渡すことができます。ただし、後続の他のステートでも注意することがあります。

まずは、ParametersでJSONキーを指定する必要があります。

```json
{
    "InputValue.$": "$.SetEnvValue.Item"
}
```

![](https://storage.googleapis.com/zenn-user-upload/543cf80f47aa-20241012.png)

さらに、次のステートでもアウトプットを設定しないといけません。これをしないと先ほど同様上書きされて後続で一つ目の値を利用できません。
**ResultPath** に`$.Output1`と設定します。

![](https://storage.googleapis.com/zenn-user-upload/4f0b9e6fb789-20241012.png)

最後のステートで両方の値を出力してみます。
```json
{
    "InputValue.$": "$.SetEnvValue.Item",
    "Output1Value.$": "$.Output1.InputValue"
}
```

![](https://storage.googleapis.com/zenn-user-upload/f2d87d4f1691-20241012.png)

![](https://storage.googleapis.com/zenn-user-upload/de998bf6e0bc-20241012.png)

これによって、複数のステートを跨いで変数を利用することができるようになりました。
ただし、これだとAPIを実行した際にレスポンスが全てパラメータに入ってきて、出力が追いにくくなることもあるので、**OutputPath** やAPIのステートにある **ResultSelector** を利用することをオススメします。この辺りの変数の位置付けについては[公式ガイド](https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/concepts-input-output-filtering.html)や[クラメソさんブログ](https://dev.classmethod.jp/articles/step-functions-parameters/)を参照して理解を深めていただければと思います。



# 日付操作
基本的にStepFunctionsで日付の加減算や比較判定などの日付操作をすることはできません。唯一利用できる時間として、[**コンテキストオブジェクト**](https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/input-output-contextobject.html)から得られる実行開始時間となります。
コンテキストオブジェクトを利用するためには以下のようにPassステートを利用します。

![](https://storage.googleapis.com/zenn-user-upload/491cb4983808-20241012.png)

実行結果は以下のようになり、実行に関する各種情報が取れているのがわかります。

![](https://storage.googleapis.com/zenn-user-upload/b00b0593b84f-20241012.png)

ここから、`Execution.StartTime`を取得すれば実行開始時間が利用できます。
さらに、[**組み込み関数**](https://docs.aws.amazon.com/ja_jp/step-functions/latest/dg/intrinsic-functions.html)を利用すると、日付と時間それぞれで利用するということもできます。
例えば、以下をPassステートに渡すと、yyyy-mm-dd形式の日付が取得できます。

```json
{
    "Date.$":"States.ArrayGetItem(States.StringSplit($$.Execution.StartTime, 'T'),0)"
}
```

![](https://storage.googleapis.com/zenn-user-upload/613d10b8eea2-20241012.png)

簡単に説明すると、`$$.Execution.StartTime`で実行時間を取得し、`States.StringSplit`で`T`を基準に文字列を分割して配列化します。最後に、`States.ArrayGetItem`で0番目の要素を取得して日付を抽出しています。
これを応用すると、アカウントIDやリージョンなども取得できます。

### アカウントIDの取得
```json
{
    "AccountId.$":"States.ArrayGetItem(States.StringSplit($$.Execution.Id, ':'),4)"
}
```

### リージョンの取得
```json
{
    "Region.$":"States.ArrayGetItem(States.StringSplit($$.Execution.Id, ':'),3)"
}
```


# 実行時のInput Value
実行時に任意の文字列をインプットとして与えることが出来ます。これによって、同じステートマシンの中でインプットに応じた処理を実装することが可能です。
例えば、Input ValueにECS RunTaskのOverrideをセットして、RunTaskのみを実行する子ステートマシンを呼び出すことで、コンポーネントのように使いまわすといった使い方が想定できます。

Input Valueについても、先頭Passステートでの利用だけでなく、コンテキストオブジェクトから利用できるので用途に応じて取得方法を使い分けるのが良いかと思います。

### 先頭Passステートでの変数化
記事冒頭のPassステートに`Test`という文言をセットしている部分を実行時に指定できるようにしてみます。

まずは、Passステートの中で以下のように設定します。
```json
{
  "Input.$": "$$.Execution.Input.InputValue"
}
```

この状態で実行時に以下のJSONを渡してみると、実行時の値がステートマシン内で利用できていることがわかります。
```json
{
  "InputValue":"InputTest" 
}
```
![](https://storage.googleapis.com/zenn-user-upload/fe31943fdb1f-20241019.png)


![](https://storage.googleapis.com/zenn-user-upload/70cc2dd40954-20241019.png)

ここで読み込んだ値は上述したとおり後続での利用もできますが、複数ステートで利用する場合はアウトプットをうまく活用するようにしてください。

### 先頭以外でのInputValueの利用
この仕組みはステートマシン内のどのステートでも利用できるので、実行時の呼び出しによって処理を変える場合はこちらの利用方法をとることをオススメします。
先ほどのステートをコピーして、それぞれ以下のようにParameterを設定します。この時、Outputには何も指定していません。
```json
{
  "Input1.$": "$$.Execution.Input.InputValue1"
}
```

```json
{
  "Input2.$": "$$.Execution.Input.InputValue2"
}
```

先ほどと同様にInputを渡して実行してみます。
```json
{
  "InputValue1":"InputTest1",
  "InputValue2":"InputTest2"
}
```
![](https://storage.googleapis.com/zenn-user-upload/bf823b4f5cc7-20241019.png)

2つ目のステートでもInputをうまく出力できていることがわかります。


# さいごに
ここまでで、StepFunctions自体の状態を利用してできることとTipsを合わせて記載してきました。

もちろんこれ以外の方法もありますし、Lambdaを書くのが得意であればLambdaを作る方が細かな制御を直感的にできるので有用かもしれません。ただし、冒頭でも述べたとおり、Lambdaのランタイム管理すらしたくないような方には、こういったTipsをもとにStepFunctionsに入門してみるのもアリではないでしょうか。

まだまだTipsやテンプレートとして使えるものがたたありますので、その辺りはまたの機会にまとめていきたいと思います。

