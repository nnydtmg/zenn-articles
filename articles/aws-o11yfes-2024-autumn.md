---
title: "AWS 秋の Observability 祭り ~明日使えるアセット祭り~に参加しました"
emoji: "👋"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","o11y","observability"]
published: true
---

# はじめに
2024/11/1に開催された「[AWS 秋の Observability 祭り ~明日使えるアセット祭り~](https://aws-startup-lofts.com/apj/loft/tokyo/event/3b5d70e2-9674-475b-8bd7-754b608b64b7)」に参加したので、簡単ですが参加レポートを残しておきたいと思います。


# observability祭りとは
**observability祭り**はAWSが春と秋に開催している、observabilityをテーマにしてAWSの各種サービスだけではなく、observabilityの考え方からobservabilityを導入するためのステップを進めるための方法について解説してくれるセミナーとなっています。
今回で3回目の開催となり、基本的なモニタリング、中級レベルのモニタリングを踏まえて、高度なobservabilityを導入するために必要となるアセットを簡単に取り入れる方法を、AIOps・AWS標準の機能・負荷テストの3つの観点でデモを交えて解説していただけました。

Xのハッシュタグは`#o11yfes`で追えますので、過去分も含めて興味のある方はご覧ください。


# アセットの活用
observabilityを導入するためにハードルとなるのが、予算の確保が難しいという点です。observabilityの導入で直接的にサービスに価値が生まれるということを事前に、正確に把握するということが難しく、社内での説得にハードルを感じる方は多いかと思います。

まず、observabilityを導入することが目的ではなく、価値を生み出すサービスの改善が目的であり、これまでも積極的に運用に投資するという企業は少なかったのではないでしょうか。しかし、これまで以上にシステムが複雑化する昨今、observabilityの重要性は増しています。そこで、observabilityを簡単に導入するための`アセット`としてソリューションを紹介します。

その前に、observabilityを導入するために以下の3ステップを踏むことが重要です。
1. 真似る
2. 学ぶ
3. 変える

まずは、アセットをそのまま導入しobservabilityがどんなものかを把握することが重要です。それが`真似る`というステップです。この段階ではカスタマイズする目線は持ちつつも、サンプル通りまずは導入することが重要です。
次に、`学ぶ`ステップで得られたインサイトから自社のサービスに必要なメトリクスや不足しているものが何かを学びます。
最後に必要とされたメトリクスを得られるように、1.で導入したアセットに変更を加えます。これを最初にしてしまうと、導入に時間がかかり効果が薄くなってしまいます。

ここからは紹介されたアセットについて簡単にまとめていきます。

# Failure Analysis Assistant
これはAWS Summitでもブース紹介されていた、SlackとBedrockを使って**AIOps**を導入するためのアセットとなっています。
AWSサービスの各種ログやメトリクスをまとめ、アラートから根本原因となるような箇所を要約してSlackに連携してくれるというものになっています。

障害対応の難しさは、初学者育成が難しいという部分にあります。
初学者が担当の際にメンターがつきっきりでやるというのも一つですが、そのタイミングに障害が発生しないことや、往々にして同一の障害が発生するものではない（その場合は修復できるはず）ので、障害対応のノウハウが蓄積・引き継ぎされにくいという問題があるかと思います。

そのメンターの部分を生成AIに担ってもらい、アラート発生時に確認する観点や被疑箇所をレコメンドしてくれるので、初学者育成としても効果があるということでした。ノウハウ共有としてもやり取りの結果を残しておくことで、生成AIの精度向上にも活用できるのでおすすめです。

詳細は[こちら](https://speakerdeck.com/suzukyz/yun-yong-ihentodui-ying-henosheng-cheng-ainohuo-yong-with-failure-analysis-assistant)です。[ブログ](https://aws.amazon.com/jp/blogs/news/failure-analysis-assistant-aiops/)も公開されているのでご一読ください。

リポジトリもあります。

https://github.com/aws-samples/failure-analysis-assistant

# CloudWatch 標準の新機能でできること
AWSを利用する上で欠かせないのがCloudWatchではないでしょうか。実はCloudWatch単体でも非常に高度なobservabilityを体験することができます。
CloudWatch Logsの**異常検出**で任意のロググループの出力パターンに対して、前日との出力パターンの変化やパターン比率を検出することができるので、ログのError率がわかったり、アプリケーションでのリクエスト率がわかったりします。さらに、この機能を使うにあたっては追加料金が不要で、ログの取り込み料金のみで異常検出が導入できます。

また、生成AIとの連携も進んでおり、自然言語でログクエリの作成ができたりと今後の発展も楽しみです。

CloudWatchにはネットワーク監視の機能もあります。Internet MonitorというAWSリージョンに関係する各ISPの状況がマップで見れるものもありますが、今回はAWSとオンプレミス感の専用線(DirectConnectやSite to Site VPN)の正常性をマネージドに監視できる、**Network Monitor**が紹介されました。
これはAWS側のサブネットを指定して、宛先のルーターIPを指定すると回線の正常性やターンアラウンドを監視することができます。また、障害分界点の把握としても活用でき、専用線接続している利用者にとっては非常に有用なサービスです。

ログの異常検出の資料はこちらです。
https://speakerdeck.com/tsujiba/amazon-cloudwatch-yi-chang-jian-chu-dao-ru-kaito-97aa98e0-cbeb-493c-bf9b-68afc14a1acf

Network Monitorの資料はこちらです。
https://speakerdeck.com/yukimmmm/amazon-cloudwatch-network-monitor-dao-ru-gaido-demoshuo-ming-fu-ki?slide=6


# 負荷テストと自動オブザーバビリティ
システム開発する際に避けて通れないのがテストですが、今回はその中でも負荷テストに焦点を当ててアセットを紹介します。
負荷テストを行う際に考慮すべきなのは、負荷をかけられるサービス側だけではありません。負荷をかける側のリソースがスケールせず想定通りの負荷がかけられないということもあるので、どちらのリソース状態の監視も必要になります。そこで、負荷テストのツールとして代表的な[Jmeter](https://jmeter.apache.org/)をECS上で実行し、スケーリングの設定なども簡単に行えるソリューションとして、**Distributed Load Testing(DLT)** on AWS ソリューションがテンプレート公開されています。

これは、テンプレートの中でJmeterを実行するECS環境とJmeterのメトリクスを保存するための**Amazon Timestream for InfluxDB**を構築します。これによって、負荷テストを実行する際に負荷をかけられるサービスに注力して、サービス開発に必要なインサイトを得やすくなります。

テンプレートはサービスページからボタンを押下するだけでもデプロイでき、導入も非常に簡単です。以下のサイトから導入可能です。
https://aws.amazon.com/jp/solutions/implementations/distributed-load-testing-on-aws/

さらにDevOps Guruも利用して統合的にボトルネックを検出する一連の流れをデモで見せていただき、とても導入するメリットを感じることができました。


# 最後に
今回この会に参加して、アセットとして公開されているのは非常に導入ハードルが下がりますし、導入するメリットも非常にあるなと感じました。
また、後半はデモを中心に質疑応答で疑問点を解消できたので、次回以降も参加していきたいなと思いました。今後は紹介いただいたアセットを検証して、そちらもブログとしてアウトプットしていきたいと思います。

以上簡単な参加レポートでした。

