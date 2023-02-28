---
title: "カスタムAMIからTerraformでEC2デプロイした時にEBSタイプが変わる？！"
emoji: "🌟"
type: "tech" # tech: 技術記事 / idea: アイデア
topics: ["aws","terraform","EC2"]
published: false
---

# 経緯
gp3のEBSが出たことでコスト削減のために、gp2からgp3に変更する対応を行っていた。
ベースのEC2イメージとして、gp2のEBSがアタッチされたAMIをもとにTerraformでEC2をデプロイしたところ、Terraformソース内でgp3指定しているにも関わらず、元々アタッチされていたボリュームがgp2としてデプロイされてしまった。
今回はその原因と対処について検証してみた。


# 環境

構築する環境・リソースは以下の通り。

* AWS東京リージョン
* OSはWindows2019
* EBS(gp2)を一つアタッチした状態でAMIは手動で取得
* 取得したAMIをもとに、TerraformでEBS(gp3)を2つアタッチする状態でEC2を1台デプロイする


# 事前構築
まずはEBS(gp2)を一つアタッチしたWindows2019のEC2を1台構築します。

