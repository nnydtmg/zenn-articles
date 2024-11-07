---
title: "AWSの分散負荷テストソリューション ワークショップをやってみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["AWS","DLT","Jmeter"]
published: false
---

# はじめに
先日行われた「[秋のobservability祭り](https://aws-startup-lofts.com/apj/loft/tokyo/event/3b5d70e2-9674-475b-8bd7-754b608b64b7)」に参加して、負荷テストをAWSでマネージドに行うことができるサービスが、ワークショップで公開されているということを知ったので、そちらを実践しながらサービスの詳細と使ってみての感想など簡単にまとめていければと思います。

参加レポートも記事にしているので、よければ読んでください！
https://zenn.dev/nnydtmg/articles/aws-o11yfes-2024-autumn


ワークショップは[こちら](https://catalog.us-east-1.prod.workshops.aws/workshops/401f5147-738e-45d9-be9f-fed9c42a60b0/ja-JP)です。


# 分散負荷テストソリューションとは
そもそも「**分散負荷ソリューション**」とは、負荷テストを実行する環境を分散させる(複数ホストから実行する)ことによって、実行環境自体がテストの負荷に耐えられない状態になることを防ぐためのソリューションです。

通常JMeterなどの負荷テストツールを実行する場合に、EC2などにインストールしてシナリオを定義し実行するかと思いますが、このシナリオの負荷にJMeter実行用のEC2が耐えられるかどうかが、課題になり得ます。この課題を解決するのが、分散負荷ソリューションと言えます。JMeter実行環境がスケーリングし、負荷テスト時の実行クライアントの考慮を減らすというのが一番大きなメリットです。

負荷分散ツールとして有名なものでは、[JMeter](https://jmeter.apache.org/)、[K6](https://k6.io/)などがありますが、現在**DLT**(Distributed Load Testing on AWS)ではJMeter(Taurusがラッパーしている)が利用可能となっています。(2024/11時点ではK6もロードマップには入っているそうです。)

このDLTは、GUIでテストシナリオを定義するとS3に定義が配置され、それを元にFargateをベースにテスト実行環境が立ち上がるというものになります。この実行タスク数や同時実行数などもGUIで簡単に設定できるので、AWSに慣れていなくてもテスト実行が可能となっています。
さらに嬉しいのが、実行環境構築は基本的に**CloudFormationのテンプレートで構築**でき、任意のVPCを指定することで**VPC内のリソースに対してもテスト実行が可能**になるという点や、テンプレート内に**CLoudWatchのダッシュボードも含まれている**ので、テストに必要なメトリクスの取得にも困りません。
必要に応じて時系列データベースである[**InfluxDB**](https://aws.amazon.com/jp/blogs/news/run-and-manage-open-source-influxdb-databases-with-amazon-timestream/)をJMeterメトリクスのデータストアにしてテストを実行することで、時系列データとして保管するしながらダッシュボード化することも可能となっています。

DLTソリューションのCloudFormationテンプレートは[こちら](https://aws.amazon.com/jp/solutions/implementations/distributed-load-testing-on-aws/)から利用できます。



# Workshopをやってみる







