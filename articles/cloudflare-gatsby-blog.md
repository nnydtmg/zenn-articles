---
title: "Gatsby.jsとCloudflare Pagesでブログを構築してみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["cloudflare","gatsby","node"]
published: true
---
# やりたいこと

Cloudflareを勉強していると、何か作ってみたいと思いませんか？私は思いました。
そこで、アプリ開発経験がない私でも簡単に作れるもの無いかと探したところ、ブログが良いかなと思い立ち、色々と探してみました。

すると、gatsby.jsを利用すると簡単にできるよ！という記事が散見されましたので、それに倣ってやってみようと思います。
（フロント初心者なので、簡単なことを望みます、、、）

# Gatsby.jsとは

そもそも[Gatsby.js](https://www.gatsbyjs.com/)とは、reactベースの静的サイトジェネレータです。
静的サイトジェネレータとは、Webページを表示する時にビルドするのではなく、事前にビルドしたWebサイトのソースを配信するだけなので、Webサイトを高速化させることができます。

# Cloudflare Pages とは

[Cloudflare Pages](https://pages.cloudflare.com/)とは、CDNなどを提供しているCloudflare社が提供するWebページを簡単に構築・ホストすることができるサービスです。
GitHubのリポジトリと連携することで、リポジトリへのpushをトリガーにしてビルドまで実行することが可能です。
利用料も基本無料（ドメインをCloudflareに移管or Cloudflareで購入する部分でお金はかかります）で使えるので、個人利用には最適です。また、workersのエッジコンピューティングサービスやKVなどのストレージサービスもあるので、利用範囲はかなり広がります。

今回はPagesのみを利用します。アカウント登録などはすでに済んでいる状態です。

# 環境構築

今回は、Mac Book Air 2上のVSCodeのDevContainerで構築していきます。この部分も他に記事はたくさんあるので、省略します。

* ubuntu
* node 18.17
* npm 9.8.1

この状態で以下のコマンドを実行します。gatsby-cliは`5.11.0`がインストールされました。
```
npm install -g gatsby-cli
gatsby new gatsby-blog https://github.com/gatsbyjs/gatsby-starter-blog

cd gatsby-blog
gatsby develop
```

すると、サンプルページがローカルのブラウザで表示されます。

![](https://storage.googleapis.com/zenn-user-upload/57a233972f84-20230726.png)

この時点でのフォルダー構造は以下の通りです。

::: details フォルダー構成
.
├── content
│   └── blog
│       ├── hello-world
│       │   ├── index.md
│       │   └── salty_egg.jpg
│       ├── my-second-post
│       │   └── index.md
│       └── new-beginnings
│           └── index.md
├── gatsby-browser.js
├── gatsby-config.js
├── gatsby-node.js
├── gatsby-ssr.js
├── LICENSE
├── node_modules
・・・
├── package.json
├── package-lock.json
├── public
│   ├── favicon-32x32.png
│   ├── favicon.ico
│   ├── icons
・・・
│   │   └── icon-96x96.png
│   ├── manifest.webmanifest
│   ├── page-data
│   │   ├── 404.html
│   │   │   └── page-data.json
│   │   ├── dev-404-page
│   │   │   └── page-data.json
│   │   ├── index
│   │   │   └── page-data.json
│   │   └── sq
│   │       └── d
│   │           ├── 2841359383.json
│   │           └── 3257411868.json
│   ├── ~partytown
│   │   ├── debug
│   │   │   ├── partytown-atomics.js
│   │   │   ├── partytown.js
│   │   │   ├── partytown-media.js
│   │   │   ├── partytown-sandbox-sw.js
│   │   │   ├── partytown-sw.js
│   │   │   ├── partytown-ww-atomics.js
│   │   │   └── partytown-ww-sw.js
│   │   ├── partytown-atomics.js
│   │   ├── partytown.js
│   │   ├── partytown-media.js
│   │   └── partytown-sw.js
│   ├── robots.txt
│   └── static
・・・
├── README.md
├── src
│   ├── components
│   │   ├── bio.js
│   │   ├── layout.js
│   │   └── seo.js
│   ├── images
│   │   ├── gatsby-icon.png
│   │   └── profile-pic.png
│   ├── normalize.css
│   ├── pages
│   │   ├── 404.js
│   │   ├── index.js
│   │   └── using-typescript.tsx
│   ├── style.css
│   └── templates
│       └── blog-post.js
└── static
    ├── favicon.ico
    └── robots.txt
:::

`content/blog`配下に記事（.mdファイル）を作成すると、build時に`public/page-data`配下にページが作成されます。
また、プロフィールについては、`gatsby-config.js`を編集することで更新できます。
プロフィール画像については`src/componnts/bio.js`という別ファイルで設定できます。

```js:bio.js
<div className="bio">
  <StaticImage
    className="bio-avatar"
    layout="fixed"
    formats={["auto", "webp", "avif"]}
    src="../images/profile-pic.png" //ここで変更できます
    width={50}
    height={50}
    quality={95}
    alt="Profile picture"
  />
```

画像までGit管理にするかは個人の画像量に応じて設定してください。プロフィール画像などは良いかと思いますが、今後記事に画像を添付する際など、サイズ・量が多くなると面倒なので外部オブジェクトストレージなどを利用して管理するのが良いかと思います。（[GitHubのissue管理](https://qiita.com/r_midori/items/2c4feb5de05535441bc8)なども一つの手です。）


# 実際に記事を設定してみる

過去に作成したこちらの記事を元に若干変更を加えてアップロードしてみたいと思います。

https://zenn.dev/nnydtmg/articles/zenn-cli-start-manual


以下のコマンドで記事ページを新規作成して、実際に書いたMarkdownファイルをコピーしました。
```
mkdir content/blog/preview
touch content/blog/preview/article.md
```

再度`gatsby develop`を実行して、ローカルで確認してみましょう。

![](https://storage.googleapis.com/zenn-user-upload/a3cce5b0f242-20230726.png)

UIはかなりシンプルになって、一部のZenn独自のMarkdownが崩れたりするので、注意が必要です。

![](https://storage.googleapis.com/zenn-user-upload/71da795ea552-20230726.png)

![](https://storage.googleapis.com/zenn-user-upload/d8b7f3ccf0b1-20230726.png)

この辺りは、jsの改修で今後修正していく必要がありそうです。できれば継続して記事を書いていきたいと思います。


# 実際にCloudflare Pagesでホストしてみる

GitHub上にこのサイト用の任意のリポジトリを作成しておきます。
Cloudflareのトップページから、`workers&pages`のサービスページへ遷移して、Pagesのタブを開きます。

![](https://storage.googleapis.com/zenn-user-upload/8fc0104d1039-20230726.png)

---

![](https://storage.googleapis.com/zenn-user-upload/32eeb35552fc-20230726.png)

今回はGitHubから接続して利用するので、`GitHubから接続`をクリックして設定を進めます。初回の場合はGitHubへの認証が求められるので対応します。

![](https://storage.googleapis.com/zenn-user-upload/536fe2fb299c-20230726.png)

次に進み、プロジェクト名などを入力します。さらにデプロイコマンドを設定する箇所があるので、今回は`Gatsby`を選択します。すると自動でビルドコマンドなどが設定されるので、今回はそのまま進みます。

![](https://storage.googleapis.com/zenn-user-upload/7862a2e8be25-20230726.png)

保存してデプロイすると、GitHubからソースを取得して実際にデプロイを進めてくれます。

これで完成！！...とはいきません。
実は、node.jsのバージョンが18の場合、Pagesのデプロイ環境でバージョン差異などでうまくいかないことが多々あります。

[こちらの記事](https://zenn.dev/appare45/articles/cloudflarepages-gatsby)を参考にさせていただき、今回はGitHub Actionsを採用したいと思います。

# GitHub Actionsの設定をしてみる

[こちらの公式の記事](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/#use-github-actions)を参考にGitHub Actionsのワークフローを設定し、各種トークンをGitHubリポジトリのシークレットに登録します。
ちなみに、アカウントIDは[こちらのページ](https://developers.cloudflare.com/fundamentals/get-started/basic-tasks/find-account-and-zone-ids/)から取得箇所をご確認ください。私は迷ってしまって違うシークレットを入れてワークフローを失敗させてしまいました。。

また、プロジェクトは存在していないとワークフローが失敗するので、事前に失敗していたプロジェクトはそのまま残すようにしてください。

何か適当に記事に変更を加えてpushすると、ワークフローが動き出します。そして、正常に終了すると、 Cloudflare側でも正常にデプロイされているのが確認できます！

![](https://storage.googleapis.com/zenn-user-upload/2ef9351bd7fb-20230726.png)

---

![](https://storage.googleapis.com/zenn-user-upload/c050191d3099-20230726.png)

`サイトにアクセス`からプレビューページに飛ぶことができます。

![](https://storage.googleapis.com/zenn-user-upload/77f0bf808e8a-20230726.png)

これを実際のドメインに紐付けると、本番運用ができます。その方法は、過去の記事に記載しているので、ご参照ください。

https://zenn.dev/nnydtmg/articles/start-cloudflare


# 最後に

ここまで読んでいただきありがとうございます。
今回は、自前のブログをCloudflare PagesとGatsby.jsで公開してみようという記事でした。

フロント初心者でも２時間ほどでここまでできました！
簡単ではありますが、地味なハマりポイントもあり一人での解決はちょっと厳しいなぁと思いました。先人に感謝です。。

今後は見た目の修正や、Zenn記事との連携などいい感じにできるようにしていきたいです。
長い目で見ていただければ幸いです。




