---
title: "Amazon BedrockがGAされたので、触ってみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","bedrock","generativeai"]
published: false
---
# Amazon Bedrockとは
AWS上でフルマネージドに生成AIモデルを利用できるサービスです。

> Amazon Bedrock は、Amazon や主要な AI スタートアップ企業が提供する基盤モデル (FM) を API を通じて利用できるようにする完全マネージド型サービスです。そのため、さまざまな FM から選択して、ユースケースに最も適したモデルを見つけることができます。Amazon Bedrock のサーバーレスエクスペリエンスにより、すぐに FM を開始したり、FM を簡単に試したり、独自のデータを使用して FM をプライベートにカスタマイズしたり、AWS のツールや機能を使用して FM をアプリケーションにシームレスに統合してデプロイしたりできます。Amazon Bedrock のエージェントはフルマネージド型で、デベロッパーは独自の知識源に基づいて最新の回答を提供し、幅広いユースケースのタスクを完了できる生成系 AI アプリケーションを簡単に作成できます。

公式サイトは[こちら](https://aws.amazon.com/jp/bedrock/)です。

Bedrock内で提供されている基盤モデルを自由に選択し、さまざまアプリケーションなどから生成AIを利用することができます。

# 生成AIとは
生成AIではChatGPTが最も有名かと思いますが、これも生成AIの機能の一部であり、機能全体としてはAIが任意の入力に対して、保持している情報から適切な文章や画像などを生み出すものです。
この生み出す脳みそとなるのが、**大規模言語モデル(LLM)** と呼ばれるもので、ChatGPTの場合は「GPT-4」や「GPT-3.5」が裏で動いていたりします。最近ではMeta社が提供する「[Llama2](https://ai.meta.com/llama/)」やLINE社が提供する日本語モデル「[japanese-large-lm](https://engineering.linecorp.com/ja/blog/3.6-billion-parameter-japanese-language-model)」などさまざまなLLMが出てきています。

保持している情報から学習の度合いが変わるため、自社のデータを使ってさらに学習させることで特定の利用に特化した生成AIモデルを作ることも可能です。
最近では、エンタープライズ検索エンジン（Azure Cognitive SearchやAmazon Kendraなど）との連携で、検索機能は検索エンジンに任せ、その結果を元に生成AIが回答をまとめるといった使い方も注目されています。


# やってみる
物は試しで触っていこうと思います。

::: message
リリースと同時に注目モデルのClaudeは審査待ちがかなり待ち状態になってしまったので、こちらは今回使いません。
:::

ワークショップも早速提供されています。日本語化もされているので、非常に力の入れようがわかります。ただし、詳細な手順やコードはGithubにしかないので、そちらも参照しながら行うことをオススメします。

日本語版：
https://catalog.us-east-1.prod.workshops.aws/workshops/a4bdb007-5600-4368-81c5-ff5b4154f518/ja-JP/20-intro/21-environmentsetup

英語版：
https://github.com/aws-samples/amazon-bedrock-workshop/tree/main

このワークショップでは、以下の項目が用意されています。

* テキスト生成
* 文章要約
* 質問への回答
* チャットボット
* 画像生成
* コード生成
* エージェント

LangChainと組み合わせることでさらに活用方法が広がるのですが、こちらは一般的な使い方になるので、Bedrockの紹介とは別に取り組んでみたいと思います。

## 利用できるリージョン
2023/9/29現在、利用できるリージョンはオレゴン、バージニア北部、オハイオ、シンガポールとなっています。しかし、フルで利用するにはオレゴン・バージニアの2択となっています。

![](https://storage.googleapis.com/zenn-user-upload/c5682bc423d7-20230929.png)

今回はバージニアで進めます。


## 利用できるモデル
Bedrockのサービスページに遷移すると、左下の「**Model Access**」から利用したいモデルの有効化を行います。

![](https://storage.googleapis.com/zenn-user-upload/340ee9a57f57-20230929.png)

今回は**AI21 Labs**の**Jurassic-2 Mid**を使っていこうと思いますので、Editからチェックボックスを選択して保存します。しばらく有効化に時間がかかりますが、完了したらアカウントのメールアドレスに完了通知がきます。

![](https://storage.googleapis.com/zenn-user-upload/f413c116900f-20230929.png)

Access Statusが**Access granted**になっていれば利用可能な状態になっています。

![](https://storage.googleapis.com/zenn-user-upload/b6cb24113f5b-20230929.png)


## プロンプトエンジニアリングパターン
まずは基本的な使い方である、プロンプトエンジニアリングと呼ばれるチャットベースの生成AIの活用です。いわゆるChatGPTです。
左ペインの「**Chat**」から利用可能なモデルを選択すれば使えるようになります。

![](https://storage.googleapis.com/zenn-user-upload/987be2f5d7fc-20230929.png)

さらに、右下の「**Update inference configurations**」から各種パラメータを変更することも可能ですので、必要なパラメータはこちらから変更して利用してください。パラメータの詳細はChatGPT関連の記事でたくさん紹介されているので今回は割愛します。
若干ワークショップのUIとは異なりますが、できることは同じです。

![](https://storage.googleapis.com/zenn-user-upload/37d3a5baacdf-20230929.png)

**Zero-Shot**プロンプトを実践してみます。[Zero-Shotプロンプト](https://www.promptingguide.ai/jp/techniques/zeroshot)とは、いわゆる例示をせずに任意の回答を答えさせるプロンプトエンジニアリングです。単語を答えるなどであれば問題ないですが、少し複雑な回答を求めると若干チグハグになる場合があります。

ワークショップの例文をコピーして貼り付けてみると、回答自体は合っていそうです。一般的な回答は問題なくできる様子です。

![](https://storage.googleapis.com/zenn-user-upload/20656fa34748-20230929.png)

次に、**Few-Shot**プロンプトを実践してみます。[Few-Shotプロンプト](https://www.promptingguide.ai/jp/techniques/fewshot)とは、回答してほしい形式を指定したり、プロンプト内で簡単な学習を与えるための手法です。特定の分野を扱う場合や回答形式を指定したい場合などに有効な手法となります。

こちらもワークショップの例文をコピーして貼り付けてみます。それなりに考えて返してくれているように見えます。

![](https://storage.googleapis.com/zenn-user-upload/7ba573a3686a-20230929.png)

この章は何となくいい感じにできたかなと思います。
まんまChatGPTなので、単純にモデルを試したい時などはコンソール画面から実行すれば手軽に試すことができます。


# 感想
ついにAWS上でも生成AIを簡単に使うことができるようになりました！
これまでこのためにAzureを提案していたり、かなり曲がった方法を取っていたので、ユーザーとして選択肢が増えていくことには非常にいいことだと思います。
モデルの精度や他サービスとの連携、料金など様々確認観点はありますが、取り急ぎ触ってみたメモとして残しておこうと記事にしてみました。継続してチェックをしていきたいと思います。




