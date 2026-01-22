---
title: "Toranomon TechHub 第6回を開催しました！"
emoji: "⛳"
type: "idea" # tech: 技術記事 / idea: アイデア
topics: []
published: false
---

# はじめに
2026/1/20にToranomon TechHub 第6回を開催したので、その開催報告として簡単にご紹介させていただきます。

https://toranomon-tech-hub.connpass.com/event/375624/

# Alembicを使ってDBのマイグレーションをやってみた by 井口 雅士
Alembicは認知してないので非常に気になるテーマでした！
インフラはIaCで作ってもテーブル定義とかはできない→中身までコード管理できないか？から検討が始まった

Pythonで利用されるDB管理ツール。バージョン管理もできる。
実行のバージョン管理はできるがそれぞれコマンド実行するのが面倒なので、ラップするsqlalchemyを使用している。
SQLModel
差分更新を検知してバージョンファイルを作ったりもできる。
Configやenvファイルで環境ごとの設定を外だしすることもできる。

DBの状態がバージョン管理できる・モデルファイルで一元管理できる
同じモデルファイルを介してフロント・バックで開発がスムーズになる

自動生成を信じ切るのはダメ！反映されない項目もあるとのこと。


# 初心者を卒業したい！CDKをちゃんと理解するためにAspectsを覗いてみる by Shota Kawasaki
私もAspectsはなんとなくでしか分かってないのでありがたい！

L2コントラクトの抽象度が高い部分には助けられることは多い
Grandに感動

タグの一括適用もすごい助かる

AI使ってるといい感じに実装してくれてしまうので、ちゃんと覗いてみよう、コントリビュートしたい！すばらしい。1年目ですよね

ライフサイクルまで深掘りしているのが素晴らしい。Visitorデザインパターン。

自信を持って好きと言えるように。素晴らしい

https://speakerdeck.com/kawaaaas/chu-xin-zhe-wozu-ye-sitai-cdkwotiyantoli-jie-surutameniaspectswosi-itemiru


# サーバレスアプリケーションの開発に入れたけど何も知らなくて失敗した話 by 食パン@あべけん
EC2上のポータルサイトの保守運用担当だがサーバレスアプリケーションにJoin！
API Gateway、Lambda、Sfn(Lambda)で証明書発行システム

エラーハンドリングが難しかった
知らないまま使ったので複雑化してしまった

リザルトセレクターでの処理がうまくいかなかった

Sfnの変数扱いは確かにむずい

Lambdaリザルトに逃して動くようにはしたが、他に影響が出てしまった

80ポリシー・35ロールが、9ポリシー・５ロールに削減は素晴らしい

いきなりの走りだし、ハンズオンなどで軽くでも経験しておく

https://www.docswell.com/s/6073979229/ZREVYE-2026-01-20-165256

# Google Cloudで解決　新人エンジニア3つの壁 by 戸塚 晴菜
1年目で登壇がすごい

・情報の壁
    情報がどこにある？はみんなが経験してる
    忙しそうな先輩に聞くのが、、、
・環境の壁
    手順書通りでも動かない
    OSバージョン違い
・実装の壁
    コマンドや設定ファイルがわからない
    手が動かない
これらを越えようとする1年目が恐ろしい。しかもGoogleCloudを使おうとは普通ならない
AIネイティブ世代ですね。NotebookLMは優秀。先輩に聞く前に解決して心理的なハードルも下がった

ちゃんとツールを使って解決策を見出しているのはとても良いですね
セキュリティのことも考えているのもGood


# Copilot Background Agent とgit worktreeを使った並列開発してみた by 榊谷 友規
話題のAI並列開発についてまたまた1年目の方から！

AIが実装してくれるまでの時間が長いなと感じるのか。
この間を埋めたい！並列開発してみよう！やってみよう！が良い

それぞれのツールの説明が易しくて、資料も読みやすいのがとてもGood

VSCodeからぽちぽちでも並列開発はできる！
Git worktree間のファイル共有などはできない

とても優しい喋り方でスッと入ってきた

# Amazon Quick Suite は私のバディになりうるか by utause
新卒3年目、去年からAWSを勉強中

Amazon Quick Suiteは社内でも利用はあるが、外部で話を聞くことがないのでとても楽しみ

機能群整理が助かる

AutomateがFlowsより複雑なものに向いている

AI Builders Dayでのセッションから使ってみたい！となってそのまま使って発表の流れが素晴らしい

RAG的に使ってレポート出力もしてくれる。チャットだけで情報整理や可視化ができるのはめちゃくちゃ良い機能だと思った。

Automateはドラッグしながらフローを作るが結構複雑で難しい！
AIと会話して全部完結！にはならないけど、サポートとしてとても助かった


# 責任感のあるCloudWatchアラームを設計しよう by アキキー
「責任感のある」というのがポイント

アラームが発砲されるまでの流れの説明から、アラーム運用の落とし穴まで普段のハマりポイントがまとまっていてGood
→他から持ってきたもの「責任感がない」もの

推奨アラームから始めると良い
https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/Best_Practice_Recommended_Alarms_AWS_Services.html

一部のものに限られるが、リソースごとのページにも情報がある

システムの停止に気付けるようにする

対応方針を検討する→アクションがないアラームはノイズになる。その通り！
アクションがないならそもそもアラームにしない

アラームの重要度を考える→業務影響はないが調査したいものなどは通知手段をそもそも変える

アクションが同じなら複合アラームにするなども効果的

そもそもアラームを作成しない
    マネージドに再実行ポリシーがあるものなど

https://speakerdeck.com/akihisaikeda/ze-ren-gan-noarucloudwatcharamuwoshe-ji-siyou


# AWS Systems Manager PatchManagerのコンプライアンスレポートをBacklogWikiにしてみた by 大嵩洋喜
Backlog Wikiの話とAWSの話を組み合わせて聞くことがないので面白い
iret mediaでも公開済み

エグいの作ってきた！

パッチ適用にパッチマネージャを使う、まではよくあるけど、その先の運用が回らないことが多いので、チケット管理システムと直結させるのはとても良いアプローチ

OSやIPなどに加えてビルド番号などもみれる
インスタンスごとに管理できる表を出力できる

https://speakerdeck.com/otake0609x/toranomon-tech-hub-di-6hui-aws-systems-manager-patch-managerno-konpuraiansurepotowobacklogwikinisitemita


