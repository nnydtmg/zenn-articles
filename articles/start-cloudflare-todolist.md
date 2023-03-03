---
title: "CloudflareでTodoListを作ってみる"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["Cloudflare","Tech","tutorial","入門"]
published: false
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

<!--01-->


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

<!--02-->

この状態ではまだworkersからKVを参照する事が出来ないので、バインディングの設定を行います。
[こちら](https://developers.cloudflare.com/workers/wrangler/workers-kv/)を参考にすると、wrangler.tomlに `kv_namespaces = []`を追加すれば良いようです。
valueにはKVを作成した時の最後に表示される`{ binding = "TODO_LIST", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }` を設定します。

```:wrangler.toml
kv_namespaces = [
  { binding = "TODO_LIST", id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" }
]
```

再度デプロイしてみます。Todosという画面が表示されていれば完成です。

<!--03-->

適当な値を入れてみましょう。
`first test`という文字を登録してみます。
コンソールから状態を確認すると、登録されている事は確認できます。

<!--04-->

コマンドではこちらです。

```bash
wrangler kv:key get --binding=TODO_LIST "data-2400:2200:5e9:a58b:4161:251a:91dc:92d8"
```

なんだかキーが見にくいので、改善したいですね。

# オプション





