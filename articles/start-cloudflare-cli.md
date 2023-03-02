---
title: "Cloudflare WorkersをWranglerで構築してみる"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["Cloudflare","Tech","wrangler","入門"]
published: true
---

# Introduction

前回Cloudflareに入門するため、手動でWorkersを構築してみました。

https://zenn.dev/nnydtmg/articles/start-cloudflare

数十回クリックするだけでWorkersがデプロイ出来ることが確認でき、めちゃくちゃ驚きました。
手動で作れることが確認出来れば、コードで実行したくなるのがシステム屋さんの性でしょう！（知らんけど）

という事で、今回はWranglerというCloudflare Workers用のCLIを使ってWorkersをデプロイしてみたいと思います。


# 前提

記事の前提は以下2点のみです。インストールから順に試していこうと思います。
※実行環境はWSL2上のUbuntu22.04です。

* Cloudflareのアカウントが作成済であること
* ドメインが登録済であること


# インストール

npmでwranglerをインストールします。

```bash
npm install -g wrangler
```

```
npm WARN deprecated rollup-plugin-inject@3.0.2: This package has been deprecated and is no longer maintained. Please use @rollup/plugin-inject.
npm WARN deprecated sourcemap-codec@1.4.8: Please use @jridgewell/sourcemap-codec instead

added 101 packages, and audited 102 packages in 14s

11 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
npm notice
npm notice New major version of npm available! 8.19.2 -> 9.6.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v9.6.0
npm notice Run npm install -g npm@9.6.0 to update!
npm notice
```
いろいろwarningが出てますが、一旦無視します。
バージョンを確認します。

```bash
wrangler --version
```

バージョン2.12.0が確認出来ました。
```
 ⛅️ wrangler 2.12.0
--------------------
```

OAuthでCloudflareにログインします。

```bash
wrangler login
```

ブラウザに認証画面が表示されます。

|![](https://storage.googleapis.com/zenn-user-upload/5e8c75119bcd-20230302.png)|
|:--|

Allowを選択して認証を完了させましょう。

|![](https://storage.googleapis.com/zenn-user-upload/dc8de6df7f16-20230302.png)|
|:--|


# wrangler init

では、実際に構築を進めていきます。
今回はJavaScriptのWorkersを `nnydtmg-workers-js` という名前で構築していこうと思います。

```bash
wrangler init nnydtmg-workers-js
```

作成するリソースを確認されます。
今回は以下のようにしています。js、Fetch handler、jestを選択しました。
```
 ⛅️ wrangler 2.12.0
--------------------
Using npm as package manager.
✨ Created nnydtmg-workers-js/wrangler.toml
✔ Would you like to use git to manage this Worker? … no
✔ No package.json found. Would you like to create one? … yes
✨ Created nnydtmg-workers-js/package.json
✔ Would you like to use TypeScript? … no
✔ Would you like to create a Worker at nnydtmg-workers-js/src/index.js? › Fetch handler
✨ Created nnydtmg-workers-js/src/index.js
✔ Would you like us to write your first test? … yes
✔ Which test runner would you like to use? › Jest
✨ Created nnydtmg-workers-js/src/index.test.js
```

こんなメッセージが出て初期化が完了します。
```
To start developing your Worker, run `cd nnydtmg-workers-js && npm start`
To start testing your Worker, run `npm test`
To publish your Worker to the Internet, run `npm run deploy`
```

`nnydtmg-workers-js` というディレクトリが作成されているので、移動して中身を見てみます。
すると、以下のリソースが作成されています。

|![](https://storage.googleapis.com/zenn-user-upload/d9ab501c8c87-20230302.png)|
|:--|

各ファイルの用途はこのようになっています。README等必要なファイル以外は省きます。

|ファイル名|説明|
|:--|:--|
|src/index.js|実際のアクセスポイントとなるファイル。初期はHello Worldを表示するだけ。|
|src/index.test.js|init時にtest有で初期化したため、jestのテストファイルが作成されている。|
|wrangler.toml|基本設定ファイル。アクセスポイント等が記載されている|


# wrangler dev

ローカルデプロイ用のコマンドです。ローカルブラウザでアプリの動作確認を行うことが出来ます。

```bash
cd nnydtmg-worker-js
npx wrangler dev
```

すると、ローカルのアクセス用アドレスが表示されるのでアクセスしてみましょう。
```
 ⛅️ wrangler 2.12.0 
--------------------
⬣ Listening at http://0.0.0.0:8787
- http://127.0.0.1:8787
- http://172.19.191.209:8787
Total Upload: 0.19 KiB / gzip: 0.16 KiB
Script modified; context reset.
```

|![](https://storage.googleapis.com/zenn-user-upload/d2717af54f2b-20230302.png)|
|:--|

きちんと表示されている事が確認できたので、実際にデプロイしてみましょう。


# wrangler publish

コマンドを実行します。
```bash
npx wrangler publish
```

```
 ⛅️ wrangler 2.12.0 
--------------------
Total Upload: 0.19 KiB / gzip: 0.16 KiB
Uploaded nnydtmg-workers-js (1.29 sec)
Published nnydtmg-workers-js (4.26 sec)
  https://nnydtmg-workers-js.nnydtmg.workers.dev
Current Deployment ID: xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxx
```
これでデプロイ出来たので、表示されているドメインにアクセスしてみましょう。

|![](https://storage.googleapis.com/zenn-user-upload/8247a5b7d708-20230302.png)|
|:--|

出来ましたね、、すごい簡単。
ドメインの設定については以前の記事をご参照ください。

ちょっと変更を加えてみます。
末尾に `from wrangler` という文字を追加します。

```js:src/index.js
return new Response("Hello World from wrangler!");
```

再度 `publish` してみましょう。
先ほどのブラウザを更新すると、、

|![](https://storage.googleapis.com/zenn-user-upload/9d6a85bcff2a-20230302.png)|
|:--|

上手く更新されました。

こんな感じで簡単にWorkersがデプロイ出来るので非常に便利です。
では、ドメインをいちいち変更するのがめんどくさいという方！朗報です。 **カスタムドメイン** という機能を利用してみましょう。


## カスタムドメイン

カスタムドメインを利用すると、workers.devのドメインを指定したドメインで上書きする事が可能です。
やってみましょう。

追加するのはこの3行だけです。
```toml:wrangler.toml
routes = [
  {pattern = "カスタムドメイン名", custom_domain = true}
]
```

再度 `publish` します。
先ほどのブラウザを更新すると表示出来なくなっているはずです。

|![](https://storage.googleapis.com/zenn-user-upload/ed7c275e837c-20230302.png)|
|:--|

では、指定したドメインを確認してみましょう。

|![](https://storage.googleapis.com/zenn-user-upload/3e85bbdf0602-20230302.png)|
|:--|

きちんと表示されています。
これがカスタムドメインの機能です。


# 最後に

ここまでがWranglerを使ったWorkersの構築手順でした。
どうですか？非常に簡単ですね。
ここからさらにJavaScriptを更新することで簡単なページやアプリを作ることが出来ます。

前回も書いてましたが、そろそろKV触って簡単なアプリケーションに挑戦しようと思います！
最後まで読んでいただき、ありがとうございました！
