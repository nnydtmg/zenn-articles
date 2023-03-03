---
title: "CloudflareでTodoListを作ってみる"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["Cloudflare","Tech","tutorial","入門"]
published: true
---

# Introduction

前回はWranglerを使ってCloudflare Workersをデプロイすることが出来たので、今回はエバンジェリストの亀田さんがZennで記事にしてくれているTodoListアプリを作ってみようと思います。

https://zenn.dev/nnydtmg/articles/start-cloudflare-cli

さらに全てコードで出来るようにちょっと頑張ってみようかと思います。
サービスの詳しい情報はぜひ亀田さんの記事をご参照ください。

https://zenn.dev/kameoncloud/articles/7236a2c6ad35c0


そしてようやくKVを使うことになります！（詳細は過去記事をご覧ください。。

では、早速スタートです！

※環境は前回作成した時と変わりませんので、Wranglerインストール等は過去記事をご覧ください。


# Workeers 構築

前回同様、wranglerで構築します。

```bash
wrangler init nnydtmg-todolist
cd nnydtmg-todolist/
```

初期化が完了したら、ひとまず `index.js` を更新してみます。
亀田さんの記事からコピペしています。

この状態で `wrangler publish` するとエラーが発生します。記事にある通り、KVの設定がないから当たり前ですね。

|![](https://storage.googleapis.com/zenn-user-upload/c01aabc79d91-20230303.png)|
|:--|


# Workers KV 構築

Wrangler は周辺リソースも構築できるので、せっかくなのでKVもwranglerで構築してみます。
リファレンスは[こちら](https://developers.cloudflare.com/workers/wrangler/commands/#docs-content)

namespaceを構築するにはこちらのコマンドです。

```bash
wrangler kv:namespace create <NAMESPACE> [OPTIONS]
```

今回は `TODO_LIST` というnamespaceを作成していきます。

```bash
wrangler kv:namespace create TODO_LIST
```

このような形で、末尾にidが出力されています。後で重要になるので末尾全てコピーしておきましょう。

```
Delegating to locally-installed wrangler@2.12.0 over global wrangler@2.12.0...
Run `npx wrangler kv:namespace create TODO_LIST` to use the local version directly.

 ⛅️ wrangler 2.12.0 
--------------------
🌀 Creating namespace with title "nnydtmg-todolist-TODO_LIST"
✨ Success!
Add the following to your configuration file in your kv_namespaces array:
{ binding = "TODO_LIST", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
```

コンソールからも確認が出来ました。

|![](https://storage.googleapis.com/zenn-user-upload/42db81f76d22-20230303.png)|
|:--|

この状態ではまだworkersからKVを参照する事が出来ないので、バインディングの設定を行います。
[こちら](https://developers.cloudflare.com/workers/wrangler/workers-kv/)を参考にすると、wrangler.tomlに `kv_namespaces = []`を追加すれば良いようです。
valueにはKVを作成した時の最後に表示される`{ binding = "TODO_LIST", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }` を設定します。

```:wrangler.toml
kv_namespaces = [
  { binding = "TODO_LIST", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

再度デプロイしてみます。Todosという画面が表示されていれば完成です。

|![](https://storage.googleapis.com/zenn-user-upload/54f416c79098-20230303.png)|
|:--|

適当な値を入れてみましょう。
`first test`という文字を登録してみます。
コンソールから状態を確認すると、登録されている事は確認できます。

|![](https://storage.googleapis.com/zenn-user-upload/4ca6a168f50f-20230303.png)|
|:--|

コマンドではこちらです。
恐らくkeyはかなり複雑なものになってるかと思いますので、コンソールからコピーして使ってください。

```bash
wrangler kv:key get --binding=TODO_LIST "key"
```


# オプション

Cloudflareには無料で使えるゼロトラスト機能もあるんです！
ということで使ってみたいというただの好奇心で設定してみます。

左ペインからZero Trustを選択します。

|![](https://storage.googleapis.com/zenn-user-upload/5c1085f92d84-20230304.png)|
|:--|

team名？を入力します。会社単位や管理するグループのイメージですかね。

|![](https://storage.googleapis.com/zenn-user-upload/ae671eae69a5-20230304.png)|
|:--|

すると、プラン選択画面が出てきますが、フリープランを選択します。
50人までは無料で使えるのですごいですよね。
支払い情報の登録も出てきますが、間違いなく無料なので安心して進めてください。

|![](https://storage.googleapis.com/zenn-user-upload/fb2af7a7f252-20230304.png)|
|:--|

|![](https://storage.googleapis.com/zenn-user-upload/4aaa77610d5c-20230304.png)|
|:--|

すると登録しているメールアドレスにメールが飛んでくるので、そこからAccessの管理画面に入ります。

|![](https://storage.googleapis.com/zenn-user-upload/654992882135-20230304.png)|
|:--|

すぐにZero Trustの画面に飛ばされるので、そちらに遷移します。

|![](https://storage.googleapis.com/zenn-user-upload/894fa67e8a33-20230304.png)|
|:--|

アプリの登録を行います。
今回はSelf-hostedを選択しました。

|![](https://storage.googleapis.com/zenn-user-upload/45b63532a86d-20230304.png)|
|:--|

ここから各種設定を行います。まずは、設定したいアプリの名前とドメインを登録します。
そのほかはデフォルトで一旦進めます。

|![](https://storage.googleapis.com/zenn-user-upload/a53e136100dc-20230304.png)|
|:--|

ポリシーを設定します。Configure rulesでメールでの認証等を登録しておきます。

|![](https://storage.googleapis.com/zenn-user-upload/50830c07e6b3-20230304.png)|
|:--|

CORSのオプションなども出来るようですが、今回はデフォルトで進めます。

|![](https://storage.googleapis.com/zenn-user-upload/e620446aa33d-20230304.png)|
|:--|

これだけでZero Trustが実装できるなんて驚きです。。（もっと考慮すると大変なのかもしれませんが、少なくとも今回のレベルでは十分です）

先ほど作成したアプリにアクセスしてみましょう！
すると、認証画面が最初に出てくるので登録した情報を入れてアプリの画面に入れることを確認します。

|![](https://storage.googleapis.com/zenn-user-upload/0425f01f70f3-20230304.png)|
|:--|

ログインできたかと思います。
ポリシーで設定した期間はセッションが残るので、ログインは出来る状態になってます。


# さいごに

これにてTodoList作成は完了です。
いかがだったでしょうか。個人的には他のプラットフォームよりも全体的に簡単に感じました。
ぜひ皆さんもCloudflare触ってみてください！

