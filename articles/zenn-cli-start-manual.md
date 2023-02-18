---
title: "Zennをローカルで執筆できるようにしてみる"
emoji: ""
type: "tech" # tech: 技術記事 / idea: アイデア
topics: [docker,Tech,Zenn,VSCode]
published: false
---

# Zennをローカルで執筆するために必要なこと

Zennを書くときに使い慣れたVSCodeを使えないかなと思っていた時に、ちょうど良い記事を見つけました。

https://zenn.dev/roppi/articles/zenn-cli-textlint-in-docker


この記事では、Dockerを使って執筆環境を作成し、Zenn CLIを利用してプレビューし、GithubにpushするとZennに記事が投稿されるというものです。
かなり丁寧にまとめてもらえているので、特に困ることなく構築出来ました。ありがとうございます！

ポイントとして、Docker DesktopなどローカルのDocker環境の整備が事前に必要です。


# やってみて

新記事を作成する時はこちらのコマンドで基本的にslugを指定する形で作成するのをおすすめします。
これによって同じコンテナ内で複数記事を管理しやすくなります。
ちなみに、同じリポジトリにpushしても、このslugで別記事としてデプロイする事が可能です。

:::details 新記事作成(slug指定版)
npx zenn new:article --slug my-awesome-article
:::

公開したいときは、publishedパラメータを ***true*** に変更するだけです。簡単ですね。

emojiの変更は、

