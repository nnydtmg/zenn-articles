---
title: "Amazon DevOps Guruを使ってみた"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","devops","guru"]
published: false
---

# Amazon DevOps Guruとは

機械学習を利用して開発者と運用者がアプリケーションパフォーマンスと可用性を向上させるためのヒントを提示してくれるサービスです。
https://aws.amazon.com/jp/devops-guru/

サービスとしてはサーバレスアプリケーションに向けた[Amazon DevOps Guru for Serverless](https://aws.amazon.com/jp/devops-guru/features/devops-guru-for-serverless/)と、RDSに向けた[Amazon DevOps Guru for RDS](https://aws.amazon.com/jp/devops-guru/features/devops-guru-for-rds/)が提供されています。

## Amazon DevOps Guru for Serverless
アプリケーションの問題をプロアクティブに検出し、事前にレコメンドしてくれるというのが最大の特徴です。例えば、Lambdaを利用している場合、同時実行数の設定ミス等でアプリケーション全体のパフォーマンス低下を引き起こす可能性があります。このケースでは影響の重要度や正常に稼働するための推奨同時実行数を提示するなどの洞察が得られます。
さらに、[Amazon CodeGuru Profiler](https://aws.amazon.com/jp/codeguru/)と統合されているので、Lambdaのコードで不備がないかについてもチェックすることが可能です。

## Amazon DevOps Guru for RDS
もともとRDSに関しては ***Amazon RDS Performance Insights*** がありましたが、DevOps Guruに統合されました。
これによって、RDSのパフォーマンスに関して一元的に分析し、異常を自動検出できるようになりました。DBインスタンスのOSのメトリクスまで様々なテレメトリが収集され、問題解決がより迅速に行えます。


# アプリケーションメトリクスについて





# 最後に




